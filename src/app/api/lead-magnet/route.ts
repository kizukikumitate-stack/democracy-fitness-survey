import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

/**
 * /api/lead-magnet
 *
 * 無料PDF（リードマグネット）のメール送付API。
 * 合宿申込（/api/camp-signup）と同じ仕組みで動く:
 *   1. customers を email キーで upsert（attributes.leads に受け取ったPDFを記録）
 *   2. event_signups に履歴を1行 INSERT（event_id = 'lead-<leadId>'）
 *   3. メルマガ希望なら Resend Audience に追加
 *   4. Resend で本人宛にダウンロードリンク、森本さん宛に通知
 *
 * 新しいPDFを増やすときは LEADS に1エントリ足すだけ。
 */

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';
const RESEND_AUDIENCE_ID = process.env.RESEND_DIAGNOSTIC_AUDIENCE_ID;

type Lead = {
  title: string;
  pdfUrl: string;
  pageUrl: string;
  summary: string;
  nextLabel: string;
  nextUrl: string;
  /** 本人宛メールの文言（省略時はローパフォーマー介入チャート用の既定文） */
  usage?: string;
  nextHeading?: string;
  nextBody?: string;
  aboutLabel?: string;
};

const LEADS: Record<string, Lead> = {
  'low-performer-chart': {
    title: 'ローパフォーマー介入チャート（1枚まとめPDF）',
    pdfUrl: 'https://kizukikumitate.com/low-performer-chart.pdf',
    pageUrl: 'https://kizukikumitate.com/low-performer-chart.html',
    summary:
      'パフォーマンスが低い状態のメンバーと関わるときに、マネジャー自身の健全な認知を保つための地図です。前提・見極め・配分・関わり・自分のケアの5ステップと、関わる前の1分セルフチェックを収めています。',
    nextLabel: '対話力向上プログラム（マネジャーの関わり方を組織の習慣にする研修）',
    nextUrl: 'https://kizukikumitate.com/dialogue-program.html',
  },
  'shinnyu-taiwa-training': {
    title: '新入社員のための対話力トレーニング ご提案資料',
    pdfUrl: 'https://kizukikumitate.com/shinnyu-taiwa-training-proposal.pdf',
    pageUrl: 'https://kizukikumitate.com/shinnyu-taiwa-training.html',
    summary:
      '新入社員向け「対話力トレーニング」（デモクラシーフィットネス2日間プログラム）のご提案資料です。現場の課題、10のデモクラ筋、2日間の内容、効果測定、提供形式、実績と参加者の声、導入の流れを18ページにまとめています。',
    nextLabel: '新入社員のための対話力トレーニング（Webページ）',
    nextUrl: 'https://kizukikumitate.com/shinnyu-taiwa-training.html',
    usage: '社内でのご検討や稟議に、そのままお使いください。',
    aboutLabel: 'この資料について',
    nextHeading: 'ご相談・お見積りについて',
    nextBody:
      '受講人数・時期・会場をうかがったうえで、内容と費用をご提案します。1日・半日・1〜2時間での実施もご相談いただけます。このメールへの返信でご連絡ください。',
  },
};

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
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
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }

    const { source, leadId, name, email, newsletterOptIn, consent, selfcheck, pageUrl, details } =
      body as Record<string, unknown>;

    if (source !== 'lead-magnet-v1') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400, headers: cors });
    }
    if (typeof leadId !== 'string' || !LEADS[leadId]) {
      return NextResponse.json({ error: 'Unknown leadId' }, { status: 400, headers: cors });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400, headers: cors });
    }
    if (consent !== true) {
      return NextResponse.json({ error: 'メールアドレスの利用への同意が必要です' }, { status: 400, headers: cors });
    }

    const lead = LEADS[leadId];
    const emailNormalized = email.toLowerCase().trim();
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const wantsNewsletter = newsletterOptIn === true;
    const now = new Date();
    const nowIso = now.toISOString();
    const eventId = `lead-${leadId}`;
    const consentSource = `lead-${leadId}`;
    const leadDetails = sanitizeDetails(details);

    // ---------- 1. customers upsert ----------
    let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null;
    try {
      supabaseAdmin = createSupabaseAdminClient();
    } catch (e) {
      console.error('POST /api/lead-magnet admin client init error:', e);
    }

    if (supabaseAdmin) {
      try {
        const { data: existing, error: selErr } = await supabaseAdmin
          .from('customers')
          .select('email, name, newsletter_opt_in, newsletter_consent_source, newsletter_consent_at, attributes, first_seen_at')
          .eq('email', emailNormalized)
          .maybeSingle();
        if (selErr) console.error('POST /api/lead-magnet customers select error:', selErr);

        if (existing) {
          const attrs = (existing.attributes && typeof existing.attributes === 'object' ? existing.attributes : {}) as Record<string, unknown>;
          const leads = (attrs.leads && typeof attrs.leads === 'object' ? attrs.leads : {}) as Record<string, unknown>;
          leads[leadId] = nowIso;
          const updates: Record<string, unknown> = {
            attributes: { ...attrs, leads },
            last_seen_at: nowIso,
          };
          if (!existing.name && trimmedName) updates.name = trimmedName;
          if (wantsNewsletter) {
            if (!existing.newsletter_opt_in) updates.newsletter_opt_in = true;
            if (!existing.newsletter_consent_source) updates.newsletter_consent_source = consentSource;
            if (!existing.newsletter_consent_at) updates.newsletter_consent_at = nowIso;
          }
          const { error: updErr } = await supabaseAdmin.from('customers').update(updates).eq('email', emailNormalized);
          if (updErr) console.error('POST /api/lead-magnet customers update error:', updErr);
        } else {
          const { error: insErr } = await supabaseAdmin.from('customers').insert({
            email: emailNormalized,
            name: trimmedName || null,
            newsletter_opt_in: wantsNewsletter,
            newsletter_consent_source: wantsNewsletter ? consentSource : null,
            newsletter_consent_at: wantsNewsletter ? nowIso : null,
            attributes: { leads: { [leadId]: nowIso } },
            first_seen_at: nowIso,
            last_seen_at: nowIso,
          });
          if (insErr) console.error('POST /api/lead-magnet customers insert error:', insErr);
        }
      } catch (e) {
        console.error('POST /api/lead-magnet customers exception:', e);
      }
    }

    // ---------- 2. event_signups に履歴（PDF受取をイベントとして記録） ----------
    try {
      const client = supabaseAdmin ?? supabase;
      const { error: dbError } = await client.from('event_signups').insert({
        email: emailNormalized,
        name: trimmedName || null,
        event_id: eventId,
        event_name: lead.title,
        attended: false,
        newsletter_opt_in: wantsNewsletter,
        source: 'lead-magnet-v1',
        metadata: {
          leadId,
          pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 500) : null,
          selfcheck: selfcheck && typeof selfcheck === 'object' ? selfcheck : null,
          details: leadDetails,
          consentAt: nowIso,
        },
      });
      if (dbError) console.error('POST /api/lead-magnet event_signups insert error:', dbError);
    } catch (e) {
      console.error('POST /api/lead-magnet event_signups exception:', e);
    }

    // ---------- 3. Resend ----------
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('POST /api/lead-magnet: RESEND_API_KEY not set');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500, headers: cors });
    }
    const resend = new Resend(apiKey);

    if (wantsNewsletter && RESEND_AUDIENCE_ID) {
      try {
        const [firstName, ...rest] = trimmedName.split(/\s+/);
        await resend.contacts.create({
          email: emailNormalized,
          firstName: firstName || undefined,
          lastName: rest.length ? rest.join(' ') : undefined,
          unsubscribed: false,
          audienceId: RESEND_AUDIENCE_ID,
        });
      } catch (e) {
        console.error('POST /api/lead-magnet resend audience error:', e);
      }
    }

    // 3a. 本人宛（ここが失敗したらエラーを返す。PDFが届かないのに成功表示にしない）
    const { error: mailErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: emailNormalized,
      subject: `【PDF】${lead.title} をお送りします`,
      html: buildLeadHtml({ name: trimmedName, lead }),
    });
    if (mailErr) {
      console.error('POST /api/lead-magnet participant resend error:', mailErr);
      return NextResponse.json({ error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' }, { status: 502, headers: cors });
    }

    // 3b. 森本さん宛の通知（失敗しても成功扱い）
    const { error: adminErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: `【PDF請求】${lead.title}：${trimmedName || emailNormalized}${wantsNewsletter ? '（メルマガ希望）' : ''}`,
      html: buildAdminHtml({ name: trimmedName, email: emailNormalized, lead, wantsNewsletter, selfcheck, details: leadDetails }),
    });
    if (adminErr) console.error('POST /api/lead-magnet admin resend error:', adminErr);

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/lead-magnet error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors });
  }
}

// =============================================================
// 本人宛メール
// =============================================================
function buildLeadHtml(p: { name: string; lead: Lead }): string {
  const greeting = p.name ? `${escapeHtml(p.name)} 様` : 'こんにちは';
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f5ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5ef;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <tr><td style="background:#26215C;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;color:#c9c3ee;letter-spacing:0.15em;">KIZUKI KUMITATE KOBO</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.5;">${escapeHtml(p.lead.title)}</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#1a1a2e;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.9;">
      きづきくみたて工房の森本康仁です。PDFのご請求ありがとうございます。<br>
      下のボタンからダウンロードしていただけます。${escapeHtml(p.lead.usage ?? '印刷して手元に置いたり、マネジャー仲間と共有したりしてお使いください。')}
    </p>

    <p style="margin:24px 0;text-align:center;">
      <a href="${p.lead.pdfUrl}" style="display:inline-block;background:#26215C;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:14px;">
        PDFをダウンロードする
      </a>
    </p>
    <p style="margin:0 0 20px;font-size:12px;color:#94a3b8;line-height:1.7;text-align:center;">
      ボタンが開かない場合はこちら：<br><a href="${p.lead.pdfUrl}" style="color:#3C3489;word-break:break-all;">${p.lead.pdfUrl}</a>
    </p>

    <div style="background:#f7f5ef;border-left:4px solid #3C3489;padding:16px 20px;margin:24px 0;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1a1a2e;">${escapeHtml(p.lead.aboutLabel ?? 'このPDFについて')}</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8;">${escapeHtml(p.lead.summary)}</p>
    </div>

    <p style="margin:24px 0 8px;font-size:13px;font-weight:700;color:#1a1a2e;">${escapeHtml(p.lead.nextHeading ?? 'チャートを、チームの共通言語にするには')}</p>
    <p style="margin:0 0 16px;font-size:13.5px;color:#475569;line-height:1.9;">
      ${escapeHtml(p.lead.nextBody ?? 'このチャートは、マネジャーが一人で自分の認知を守るための道具です。層の見立てを上司と部下、人事とマネジャーのあいだで言葉にできるようになると、「全員を上げなければ」という前提が組織から外れていきます。組織で使えるようにする研修をご用意しています。')}<br>
      <a href="${p.lead.nextUrl}" style="color:#3C3489;">${escapeHtml(p.lead.nextLabel)} →</a>
    </p>

    <p style="margin:24px 0 0;font-size:13.5px;color:#475569;line-height:1.9;">
      ご質問やご相談は、このメールへの返信でお気軽にどうぞ。
    </p>
  </td></tr>

  <tr><td style="background:#26215C;border-radius:0 0 12px 12px;padding:22px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#ffffff;">きづきくみたて工房　森本康仁</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.7);">
      <a href="https://kizukikumitate.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">kizukikumitate.com</a>
      ｜ <a href="${p.lead.pageUrl}" style="color:rgba(255,255,255,0.7);text-decoration:none;">Webで見る</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// =============================================================
// 森本さん宛の通知
// =============================================================
function buildAdminHtml(p: { name: string; email: string; lead: Lead; wantsNewsletter: boolean; selfcheck: unknown; details: LeadDetails | null }): string {
  const sc = p.selfcheck && typeof p.selfcheck === 'object' ? (p.selfcheck as { answers?: unknown; noCount?: unknown }) : null;
  const scText = sc
    ? `「いいえ」${String(sc.noCount ?? '?')}個 ／ 回答: ${Array.isArray(sc.answers) ? sc.answers.map((a) => (a === 'no' ? '×' : a === 'yes' ? '○' : '-')).join(' ') : '-'}`
    : '（未実施）';
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
  <tr><td style="background:#1e293b;padding:16px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:15px;color:#ffffff;">【PDF請求】${escapeHtml(p.lead.title)}</h1>
  </td></tr>
  <tr><td style="padding:20px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
      ${row('名前', p.name || '（未記入）')}
      ${row('メール', `<a href="mailto:${p.email}" style="color:#1d4ed8;">${p.email}</a>`)}
      ${row('メルマガ', p.wantsNewsletter ? '希望（Resend Audience に追加）' : '希望なし')}
      ${p.details?.company ? row('会社名・団体名', escapeHtml(p.details.company)) : ''}
      ${p.details?.headcount ? row('人数（目安）', escapeHtml(p.details.headcount)) : ''}
      ${p.details?.message ? row('ご相談内容', escapeHtml(p.details.message).replace(/\n/g, '<br>')) : ''}
      ${row('セルフチェック', escapeHtml(scText))}
      ${row('ページ', `<a href="${p.lead.pageUrl}" style="color:#1d4ed8;">${p.lead.pageUrl}</a>`)}
    </table>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      Supabase customers（attributes.leads）と event_signups（event_id: lead-…）に書き込まれました。
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

type LeadDetails = { company: string; headcount: string; message: string };

/** フォームの追加項目（会社名・人数・ご相談内容）。文字列だけを長さ制限つきで受け取る */
function sanitizeDetails(raw: unknown): LeadDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const d = { company: pick(r.company, 200), headcount: pick(r.headcount, 50), message: pick(r.message, 2000) };
  return d.company || d.headcount || d.message ? d : null;
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
