import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const RESEND_AUDIENCE_ID = process.env.RESEND_DIAGNOSTIC_AUDIENCE_ID;

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const PDF_BASE = 'https://kizukikumitate.com/series/assets/pdf';

const TYPES: Record<string, { name: string; headline: string }> = {
  A: {
    name: '情報・フィードバック構造型',
    headline: '「期待水準とフィードバックの設計」にボトルネック',
  },
  B: {
    name: '資源・時間構造型',
    headline: '「業務量とプロセスの設計」にボトルネック',
  },
  C: {
    name: 'インセンティブ構造型',
    headline: '「評価と望ましい行動の不整合」にボトルネック',
  },
  D: {
    name: '構造複合型',
    headline: '複数の構造領域に同時に課題',
  },
  E: {
    name: 'スキル特化型',
    headline: '環境構造は機能、純粋なスキル課題',
  },
};

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }

    const {
      email,
      name,
      industry,
      role,
      type,
      scores,
      answers,
      newsletterOptIn,
      source,
    } = body as {
      email?: unknown;
      name?: unknown;
      industry?: unknown;
      role?: unknown;
      type?: unknown;
      scores?: unknown;
      answers?: unknown;
      newsletterOptIn?: unknown;
      source?: unknown;
    };

    if (source !== 'diagnostic-form-v1') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400, headers: cors });
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'email is required' }, { status: 400, headers: cors });
    }

    const typeKey = typeof type === 'string' ? type.toUpperCase() : '';
    const typeInfo = TYPES[typeKey];
    if (!typeInfo) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400, headers: cors });
    }

    const pdfUrl = `${PDF_BASE}/type-${typeKey.toLowerCase()}.pdf`;
    const displayName = typeof name === 'string' && name.trim() ? name.trim() : 'お客様';
    const wantsNewsletter = newsletterOptIn === true;

    const html = buildHtml(displayName, typeKey, typeInfo, pdfUrl);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('POST /api/diagnostic: RESEND_API_KEY not set');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500, headers: cors });
    }

    const trimmedName = typeof name === 'string' && name.trim() ? name.trim() : null;
    const trimmedIndustry = typeof industry === 'string' && industry.trim() ? industry.trim() : null;
    const trimmedRole = typeof role === 'string' && role.trim() ? role.trim() : null;
    const emailNormalized = email.toLowerCase().trim();

    // 1. customers (顧客マスタ) を email キーで upsert。
    //    既存スキーマ(bem_diagnostic_count などのチャネル別カウンタ方式)に従う。
    //    SUPABASE_SERVICE_ROLE_KEY が未設定なら admin クライアントは作れず、
    //    customers への書き込みはスキップされ、diagnostic_responses 側だけ動く。
    let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null;
    try {
      supabaseAdmin = createSupabaseAdminClient();
    } catch (e) {
      console.error('POST /api/diagnostic admin client init error:', e);
    }

    if (supabaseAdmin) {
      try {
        const now = new Date().toISOString();
        const { data: existing, error: selErr } = await supabaseAdmin
          .from('customers')
          .select(
            'email, name, bem_diagnostic_count, newsletter_opt_in, newsletter_consent_source, newsletter_consent_at, first_seen_at',
          )
          .eq('email', emailNormalized)
          .maybeSingle();
        if (selErr) {
          console.error('POST /api/diagnostic customers select error:', selErr);
        }

        if (existing) {
          // 既存顧客: BEM 診断カウンタを +1、最終受診情報を更新。
          // メルマガ同意はスティッキー true、初回同意ソース・日時は保持。
          const updates: Record<string, unknown> = {
            bem_diagnostic_count: (existing.bem_diagnostic_count ?? 0) + 1,
            bem_diagnostic_last_at: now,
            bem_diagnostic_last_type: typeKey,
            last_seen_at: now,
          };
          if (!existing.name && trimmedName) {
            updates.name = trimmedName;
          }
          if (wantsNewsletter) {
            if (!existing.newsletter_opt_in) {
              updates.newsletter_opt_in = true;
            }
            if (!existing.newsletter_consent_source) {
              updates.newsletter_consent_source = 'bem-diagnostic';
            }
            if (!existing.newsletter_consent_at) {
              updates.newsletter_consent_at = now;
            }
          }
          const { error: updErr } = await supabaseAdmin
            .from('customers')
            .update(updates)
            .eq('email', emailNormalized);
          if (updErr) {
            console.error('POST /api/diagnostic customers update error:', updErr);
          }
        } else {
          // 新規顧客: 1件目の BEM 診断として記録。
          const { error: insErr } = await supabaseAdmin
            .from('customers')
            .insert({
              email: emailNormalized,
              name: trimmedName,
              newsletter_opt_in: wantsNewsletter,
              newsletter_consent_source: wantsNewsletter ? 'bem-diagnostic' : null,
              newsletter_consent_at: wantsNewsletter ? now : null,
              bem_diagnostic_count: 1,
              bem_diagnostic_last_at: now,
              bem_diagnostic_last_type: typeKey,
              first_seen_at: now,
              last_seen_at: now,
            });
          if (insErr) {
            console.error('POST /api/diagnostic customers insert error:', insErr);
          }
        }
      } catch (e) {
        console.error('POST /api/diagnostic customers exception:', e);
      }
    }

    // 2. diagnostic_responses に回答を保存。失敗してもメール送信は続行する
    try {
      const client = supabaseAdmin ?? supabase;
      const { error: dbError } = await client
        .from('diagnostic_responses')
        .insert({
          email: emailNormalized,
          name: trimmedName,
          industry: trimmedIndustry,
          role: trimmedRole,
          type: typeKey,
          scores: scores && typeof scores === 'object' ? scores : null,
          answers: answers && typeof answers === 'object' ? answers : null,
          newsletter_opt_in: wantsNewsletter,
          source: 'diagnostic-form-v1',
        });
      if (dbError) {
        console.error('POST /api/diagnostic supabase error:', dbError);
      }
    } catch (e) {
      console.error('POST /api/diagnostic supabase exception:', e);
    }

    // 2. メルマガ希望ならResend Audienceに追加。失敗してもメール送信は続行する
    if (wantsNewsletter && RESEND_AUDIENCE_ID) {
      try {
        const resendForContact = new Resend(apiKey);
        const [firstName, ...rest] = (typeof name === 'string' ? name.trim() : '').split(/\s+/);
        await resendForContact.contacts.create({
          email,
          firstName: firstName || undefined,
          lastName: rest.length ? rest.join(' ') : undefined,
          unsubscribed: false,
          audienceId: RESEND_AUDIENCE_ID,
        });
      } catch (e) {
        console.error('POST /api/diagnostic resend audience error:', e);
      }
    }

    // 3. 診断結果メールを送信
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `【BEM診断】診断結果のお知らせ（Type ${typeKey} ${typeInfo.name}）`,
      html,
    });

    if (error) {
      console.error('POST /api/diagnostic resend error:', error);
      return NextResponse.json({ error: 'Email send failed' }, { status: 500, headers: cors });
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/diagnostic error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors });
  }
}

function buildHtml(
  displayName: string,
  typeKey: string,
  typeInfo: { name: string; headline: string },
  pdfUrl: string,
): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <tr><td style="background:#1e293b;border-radius:12px 12px 0 0;padding:24px 28px;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;letter-spacing:0.05em;">BEM 診断</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">診断結果のお知らせ</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px;">
    <p style="margin:0 0 16px;font-size:14px;color:#1e293b;">${escapeHtml(displayName)} 様</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.7;">
      この度はBEM診断にご回答いただき、ありがとうございました。<br>
      診断結果は以下の通りです。
    </p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:24px;margin:24px 0;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#3b82f6;letter-spacing:0.05em;">あなたのタイプ</p>
      <p style="margin:0 0 6px;font-size:32px;font-weight:800;color:#1d4ed8;">Type ${typeKey}</p>
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1e293b;">${typeInfo.name}</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">${typeInfo.headline}</p>
    </div>

    <p style="margin:24px 0 12px;font-size:14px;color:#475569;line-height:1.7;">
      詳しい解説と改善のヒントをまとめた PDF レポートをご用意しました。<br>
      下のボタンからご覧ください。
    </p>

    <p style="margin:24px 0;text-align:center;">
      <a href="${pdfUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:14px;">
        診断結果PDFを開く
      </a>
    </p>

    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      ※ボタンが開かない場合は以下のURLをコピーしてブラウザに貼り付けてください<br>
      <a href="${pdfUrl}" style="color:#3b82f6;word-break:break-all;">${pdfUrl}</a>
    </p>
  </td></tr>

  <tr><td style="background:#f1f5f9;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#475569;">きづきくみたて工房</p>
    <p style="margin:0;font-size:11px;color:#94a3b8;"><a href="https://kizukikumitate.com" style="color:#94a3b8;text-decoration:none;">kizukikumitate.com</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
