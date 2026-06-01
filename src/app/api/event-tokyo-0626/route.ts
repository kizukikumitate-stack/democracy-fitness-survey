import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';

const EVENT_ID = 'df-event-tokyo-2026-06';
const EVENT_NAME = 'デモクラシーフィットネス体験会 in 東京（第2回）';
const EVENT_DATES = '2026年6月26日（金）18:00〜20:00';
const VENUE = '国立オリンピック記念青少年総合センター（東京・代々木）';
const FEE_LABEL = '¥1,100（税込）';
const THEME = '今回のテーマ：好奇心筋 ・ 傾聴筋';

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8181',
  'http://127.0.0.1:8181',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

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
      source,
      name,
      furigana,
      email,
      phone,
      affiliation,
      referralSource,
      pastParticipation,
      message,
      consentTerms,
    } = body as Record<string, unknown>;

    // 1. ソース検証
    if (source !== 'event-tokyo-0626-v1') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400, headers: cors });
    }

    // 2. 必須項目検証
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '氏名は必須です' }, { status: 400, headers: cors });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400, headers: cors });
    }
    if (consentTerms !== true) {
      return NextResponse.json({ error: '当日のお支払い・キャンセルについての同意が必要です' }, { status: 400, headers: cors });
    }

    // 3. 入力の正規化
    const trimmedName = name.trim();
    const trimmedFurigana = typeof furigana === 'string' ? furigana.trim() : '';
    const emailNormalized = email.toLowerCase().trim();
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';

    const now = new Date();

    // 4. metadata jsonb に詰める（イベント固有フィールド）
    const metadata = {
      furigana: trimmedFurigana || null,
      phone: trimmedPhone || null,
      affiliation: typeof affiliation === 'string' ? affiliation.trim() : '',
      referralSource: typeof referralSource === 'string' ? referralSource.trim() : '',
      pastParticipation: pastParticipation === true,
      message: typeof message === 'string' ? message.trim() : '',
      fee: FEE_LABEL,
      theme: THEME,
      consentTermsAt: now.toISOString(),
    };

    // 5. Supabase 書き込み（admin client）
    let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null;
    try {
      supabaseAdmin = createSupabaseAdminClient();
    } catch (e) {
      console.error('POST /api/event-tokyo-0626 admin client init error:', e);
    }

    if (supabaseAdmin) {
      // 5a. customers upsert（event_count を +1、新規ならINSERT）
      try {
        const nowIso = now.toISOString();
        const { data: existing, error: selErr } = await supabaseAdmin
          .from('customers')
          .select('email, name, event_count, first_seen_at')
          .eq('email', emailNormalized)
          .maybeSingle();
        if (selErr) {
          console.error('POST /api/event-tokyo-0626 customers select error:', selErr);
        }

        if (existing) {
          const updates: Record<string, unknown> = {
            event_count: (existing.event_count ?? 0) + 1,
            event_last_at: nowIso,
            event_last_id: EVENT_ID,
            last_seen_at: nowIso,
          };
          if (!existing.name && trimmedName) {
            updates.name = trimmedName;
          }
          const { error: updErr } = await supabaseAdmin
            .from('customers')
            .update(updates)
            .eq('email', emailNormalized);
          if (updErr) {
            console.error('POST /api/event-tokyo-0626 customers update error:', updErr);
          }
        } else {
          const { error: insErr } = await supabaseAdmin
            .from('customers')
            .insert({
              email: emailNormalized,
              name: trimmedName,
              event_count: 1,
              event_last_at: nowIso,
              event_last_id: EVENT_ID,
              first_seen_at: nowIso,
              last_seen_at: nowIso,
            });
          if (insErr) {
            console.error('POST /api/event-tokyo-0626 customers insert error:', insErr);
          }
        }
      } catch (e) {
        console.error('POST /api/event-tokyo-0626 customers exception:', e);
      }
    }

    // 5b. event_signups に履歴INSERT（失敗してもメール送信は続行）
    try {
      const client = supabaseAdmin ?? supabase;
      const { error: dbError } = await client
        .from('event_signups')
        .insert({
          email: emailNormalized,
          name: trimmedName,
          event_id: EVENT_ID,
          event_name: EVENT_NAME,
          attended: false,
          newsletter_opt_in: false,
          source: 'event-tokyo-0626-v1',
          metadata,
        });
      if (dbError) {
        console.error('POST /api/event-tokyo-0626 event_signups insert error:', dbError);
      }
    } catch (e) {
      console.error('POST /api/event-tokyo-0626 event_signups exception:', e);
    }

    // 6. Resend で2通送信（参加者宛 + 森本さん宛）
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('POST /api/event-tokyo-0626: RESEND_API_KEY not set');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500, headers: cors });
    }
    const resend = new Resend(apiKey);

    // 6a. 参加者宛の申込受付メール
    const participantHtml = buildParticipantHtml({ name: trimmedName });
    const { error: participantMailErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `【受付】${EVENT_NAME} お申込みを受け付けました`,
      html: participantHtml,
    });
    if (participantMailErr) {
      console.error('POST /api/event-tokyo-0626 participant resend error:', participantMailErr);
    }

    // 6b. 森本さん宛の通知メール
    const adminHtml = buildAdminHtml({
      name: trimmedName,
      furigana: trimmedFurigana,
      email: emailNormalized,
      phone: trimmedPhone,
      metadata,
    });
    const { error: adminMailErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: `【東京体験会6/26申込】${trimmedName} 様`,
      html: adminHtml,
    });
    if (adminMailErr) {
      console.error('POST /api/event-tokyo-0626 admin resend error:', adminMailErr);
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/event-tokyo-0626 error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors });
  }
}

// =============================================================
// 参加者宛メール
// =============================================================
function buildParticipantHtml(p: { name: string }): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6ff;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <tr><td style="background:#2d4a7a;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;color:#f0b429;letter-spacing:0.15em;">DEMOCRACY FITNESS TOKYO 2026</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.5;">お申込みを受け付けました</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#1a1a2e;">${escapeHtml(p.name)} 様</p>

    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.9;">
      この度は「${EVENT_NAME}」へのお申込みありがとうございます。<br>
      以下の内容で受け付けました。当日、会場でお会いできるのを楽しみにしております。
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;font-size:13px;">
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;width:35%;color:#475569;font-weight:600;">日時</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${EVENT_DATES}</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">会場</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${VENUE}</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">参加費</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;"><strong style="font-size:15px;">${FEE_LABEL}</strong><br><span style="font-size:12px;color:#5a5880;">当日、受付にて現金またはPayPayでお支払いください。</span></td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">今回のテーマ</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">好奇心筋 ・ 傾聴筋</td>
      </tr>
    </table>

    <div style="background:#fef3e0;border-left:4px solid #e85d26;padding:18px 20px;margin:24px 0;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a1a2e;">▼ 当日について</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8;">
        動きやすい服装でお越しください。会場の詳しいアクセスや教室番号は、開催が近くなりましたら改めてご案内します。<br>
        ご都合が悪くなった場合は、前日までにこのメールへの返信でお知らせください（キャンセル料はかかりません）。
      </p>
    </div>

    <p style="margin:24px 0 12px;font-size:14px;color:#475569;line-height:1.9;">
      ご質問やご要望がございましたら、このメールへの返信、または
      <a href="mailto:y.morimoto@kizukikumitate.com" style="color:#e85d26;">y.morimoto@kizukikumitate.com</a>
      までお気軽にご連絡ください。
    </p>
  </td></tr>

  <tr><td style="background:#26215C;border-radius:0 0 12px 12px;padding:22px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#ffffff;">きづきくみたて工房</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.7);">
      <a href="https://kizukikumitate.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">kizukikumitate.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// =============================================================
// 森本さん宛の通知メール（運営側）
// =============================================================
function buildAdminHtml(p: {
  name: string;
  furigana: string;
  email: string;
  phone: string;
  metadata: Record<string, unknown>;
}): string {
  const m = p.metadata as {
    affiliation?: string;
    referralSource?: string;
    pastParticipation?: boolean;
    message?: string;
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
  <tr><td style="background:#1e293b;padding:18px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:16px;color:#ffffff;">【東京体験会 6/26 申込】${escapeHtml(p.name)} 様</h1>
  </td></tr>
  <tr><td style="padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
      ${row('氏名', escapeHtml(p.name))}
      ${row('ふりがな', escapeHtml(p.furigana || '（未記入）'))}
      ${row('メール', `<a href="mailto:${p.email}" style="color:#1d4ed8;">${p.email}</a>`)}
      ${row('電話', escapeHtml(p.phone || '（未記入）'))}
      ${row('ご所属・お立場', escapeHtml(m.affiliation || '（未記入）'))}
      ${row('知ったきっかけ', escapeHtml(m.referralSource || '（未記入）'))}
      ${row('過去の体験会参加', m.pastParticipation ? 'あり' : 'なし')}
      ${row('メッセージ', escapeHtml(m.message || '（なし）'))}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      Supabase event_signups と customers に書き込まれました（event_id: ${EVENT_ID}）。<br>
      ${EVENT_DATES} ／ ${VENUE} ／ 参加費 ${FEE_LABEL}
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <th align="left" style="padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;width:30%;color:#475569;font-weight:600;vertical-align:top;">${escapeHtml(label)}</th>
    <td style="padding:8px 10px;border:1px solid #e2e8f0;color:#1e293b;line-height:1.7;">${value}</td>
  </tr>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
