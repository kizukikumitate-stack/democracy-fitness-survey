import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// イベント申込者へのリマインド一斉送信（管理用）。
// x-admin-key（EVENTS_ADMIN_KEY）で保護。誤送信防止のため mode を分離:
//   mode='count'  : 送信せず、対象人数と宛先一覧だけ返す（確認用）
//   mode='test'   : testEmail（または管理者）宛に1通だけ送る（プレビュー用）
//   mode='send'   : 申込者全員に送る（本番）

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';
const REPLY_TO = 'y.morimoto@kizukikumitate.com';

type ReminderTemplate = {
  subject: string;
  build: (name: string) => string;
};

// event_id ごとのリマインド本文。新イベントはここに追加するだけ。
const TEMPLATES: Record<string, ReminderTemplate> = {
  'df-event-tokyo-2026-06': {
    subject: '【明日開催】デモクラシーフィットネス体験会 in 東京（第2回）当日のご案内＋お持ち物のお願い',
    build: (name: string) => buildTokyoReminderHtml(name),
  },
};

export async function POST(req: NextRequest) {
  const adminKey = process.env.EVENTS_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'not_configured', message: 'EVENTS_ADMIN_KEY が未設定です' }, { status: 503 });
  }
  if ((req.headers.get('x-admin-key') ?? '') !== adminKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { event_id, mode, testEmail } = body as { event_id?: unknown; mode?: unknown; testEmail?: unknown };

  if (typeof event_id !== 'string' || !TEMPLATES[event_id]) {
    return NextResponse.json({ error: 'unknown_event', message: 'このイベントのリマインド文面が未登録です' }, { status: 400 });
  }
  if (mode !== 'count' && mode !== 'test' && mode !== 'send') {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }
  const template = TEMPLATES[event_id];

  // 申込者を取得（email で重複排除、最新の氏名を採用）
  const recipients: { email: string; name: string }[] = [];
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('event_signups')
      .select('email, name, created_at')
      .eq('event_id', event_id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('POST /api/event-reminder query error:', error);
      return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    }
    const seen = new Set<string>();
    for (const r of data ?? []) {
      const email = (r.email ?? '').toLowerCase().trim();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      recipients.push({ email, name: (r.name ?? '').trim() });
    }
  } catch (e) {
    console.error('POST /api/event-reminder admin client error:', e);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  // mode='count' は送信せず確認情報だけ返す
  if (mode === 'count') {
    return NextResponse.json({ recipientCount: recipients.length, recipients: recipients.map(r => r.email) }, { status: 200 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
  }
  const resend = new Resend(apiKey);

  // mode='test' は1通だけ
  if (mode === 'test') {
    const to = typeof testEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)
      ? testEmail.trim()
      : ADMIN_NOTIFY_EMAIL;
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      replyTo: REPLY_TO,
      subject: `[テスト送信] ${template.subject}`,
      html: template.build('テスト 太郎'),
    });
    if (error) {
      console.error('POST /api/event-reminder test send error:', error);
      return NextResponse.json({ error: 'send_failed', detail: String(error) }, { status: 502 });
    }
    return NextResponse.json({ tested: true, to }, { status: 200 });
  }

  // mode='send' は全員へ（Resend batch を100件ずつ）
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: '対象の申込者がいません' }, { status: 200 });
  }
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    const payload = chunk.map(r => ({
      from: FROM_EMAIL,
      to: r.email,
      replyTo: REPLY_TO,
      subject: template.subject,
      html: template.build(r.name || 'ご参加者'),
    }));
    const { error } = await resend.batch.send(payload);
    if (error) {
      console.error('POST /api/event-reminder batch error:', error);
      failed += chunk.length;
    } else {
      sent += chunk.length;
    }
  }
  return NextResponse.json({ sent, failed, total: recipients.length }, { status: 200 });
}

// =============================================================
// 6/26 東京（第2回）リマインド本文
// =============================================================
function buildTokyoReminderHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6ff;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <tr><td style="background:#2d4a7a;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;color:#f0b429;letter-spacing:0.15em;">DEMOCRACY FITNESS TOKYO 2026</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.5;">いよいよ明日です — 当日のご案内</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#1a1a2e;">${escapeHtml(name)} 様</p>

    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.9;">
      いつもお世話になっております。きづきくみたて工房の森本です。<br>
      いよいよ明日となりました「デモクラシーフィットネス体験会 in 東京（第2回）」の当日のご案内をお送りします。当日お会いできるのを楽しみにしています。
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;font-size:13px;">
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;width:32%;color:#475569;font-weight:600;">日時</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">2026年6月26日（金）18:00〜20:00<br><span style="font-size:12px;color:#5a5880;">受付 17:45〜</span></td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">会場</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">国立オリンピック記念青少年総合センター（東京・代々木）<br><strong style="font-size:13px;">セ-404研修室</strong><br><span style="font-size:12px;color:#5a5880;">東京都渋谷区代々木神園町3-1</span></td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">参加費</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;"><strong>¥1,100（税込）</strong><br><span style="font-size:12px;color:#5a5880;">当日、受付にて現金またはPayPayでお支払いください。</span></td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">今回のテーマ</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">好奇心筋 ・ 傾聴筋</td>
      </tr>
    </table>

    <p style="margin:20px 0 6px;font-size:14px;font-weight:700;color:#1a1a2e;">■ 特別ゲスト</p>
    <p style="margin:0 0 18px;font-size:13px;color:#475569;line-height:1.9;">
      日本語が堪能なフィンランド出身の教育者・トミーさん（TOPAASIA 教育デザイナー）をお迎えします。フィンランドの民主主義の実態や、学校現場での民主主義教育について、現地の生の声を聞ける貴重な回です。
    </p>

    <div style="background:#fef3e0;border-left:4px solid #e85d26;padding:18px 20px;margin:20px 0;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a1a2e;">▼ お持ち物のお願い</p>
      <p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.8;">
        <strong>目を隠す道具（アイマスク・スカーフ・タオルなど）</strong><br>
        今回のワークでは、視界を遮って取り組む場面があります。ご自身が使いやすいものをお持ちいただけると安心です。<br>
        <span style="color:#1a1a2e;">※お持ちでなくても、運営側でいくつかご用意していますので、どうぞご安心ください。</span>
      </p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8;">
        ・動きやすい服装（立って動く場面があります）<br>
        ・筆記用具（あると便利です／なくても大丈夫です）
      </p>
    </div>

    <p style="margin:18px 0 6px;font-size:14px;font-weight:700;color:#1a1a2e;">■ ご注意</p>
    <p style="margin:0 0 18px;font-size:13px;color:#475569;line-height:1.9;">
      ご都合が悪くなってしまった場合は、<strong>わかった時点でお早めに</strong>このメールへの返信でお知らせください（キャンセル料はかかりません）。当日、道に迷われたときや遅れそうなときも、このメールへの返信か下記までご連絡ください。
    </p>

    <p style="margin:24px 0 0;font-size:14px;color:#475569;line-height:1.9;">
      それでは、当日お会いできるのを楽しみにしております。<br>
      ご不明な点がございましたら、お気軽にご返信ください。
    </p>
  </td></tr>

  <tr><td style="background:#26215C;border-radius:0 0 12px 12px;padding:22px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#ffffff;">きづきくみたて工房　森本 康仁</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.7);">
      <a href="mailto:y.morimoto@kizukikumitate.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">y.morimoto@kizukikumitate.com</a> ／ 070-2810-2677
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
