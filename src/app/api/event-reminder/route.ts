import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// イベント申込者へのリマインド一斉送信（管理用）。
// x-admin-key（EVENTS_ADMIN_KEY）で保護。誤送信防止のため mode を分離:
//   mode='count'  : 送信せず、対象人数と宛先一覧だけ返す（確認用）
//   mode='test'   : testEmail（または管理者）宛に1通だけ送る（プレビュー用）
//   mode='send'   : 申込者全員に送る（本番）
// 任意パラメータ:
//   template   : 同じイベントの2通目以降を選ぶ（NAMED_TEMPLATES のキー）
//   onlyEmail  : send 時、その1名だけに送る（後から申し込んだ人への追い送り）

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';
const REPLY_TO = 'y.morimoto@kizukikumitate.com';

// 合宿のお支払い期限（実施8/11の1週間前）
const CAMP_PAYMENT_DEADLINE = '2026年8月4日（火）';

type Recipient = { name: string; metadata: Record<string, unknown> | null };
type ReminderTemplate = {
  subject: string;
  build: (r: Recipient) => string;
};

// event_id ごとの送信本文。新イベント・新しい用途はここに追加するだけ。
const TEMPLATES: Record<string, ReminderTemplate> = {
  'df-event-tokyo-2026-06': {
    subject: '【明日開催】デモクラシーフィットネス体験会 in 東京（第2回）当日のご案内＋お持ち物のお願い',
    build: (r) => buildTokyoReminderHtml(r.name),
  },
  'df-camp-2026-08': {
    subject: '【お支払いのご案内】デモクラシーフィットネス キャンプ2026 in 北軽井沢',
    build: (r) => buildCampPaymentHtml(r.name, r.metadata),
  },
};

// 同じイベントに2通目以降を送るための名前付き文面。
// リクエストで template を明示したときだけ使われる（既定文面を上書きしない）。
const NAMED_TEMPLATES: Record<string, ReminderTemplate> = {
  'df-camp-2026-08:precamp': {
    subject: '【8/11-12 合宿】当日までのご案内 — 持ち物・アクセス・相乗りのご相談',
    build: (r) => buildCampPrecampHtml(r.name),
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
  const { event_id, mode, testEmail, template: templateKey, onlyEmail } = body as {
    event_id?: unknown; mode?: unknown; testEmail?: unknown; template?: unknown; onlyEmail?: unknown;
  };

  if (typeof event_id !== 'string') {
    return NextResponse.json({ error: 'unknown_event', message: 'event_id を指定してください' }, { status: 400 });
  }
  // template 未指定ならイベントの既定文面。同じイベントに2通目以降を送るときは template で明示する。
  const template = typeof templateKey === 'string'
    ? NAMED_TEMPLATES[templateKey]
    : TEMPLATES[event_id];
  if (!template) {
    return NextResponse.json(
      {
        error: 'unknown_template',
        message: typeof templateKey === 'string'
          ? `template='${templateKey}' は未登録です`
          : 'このイベントの既定文面が未登録です',
        availableTemplates: Object.keys(NAMED_TEMPLATES),
      },
      { status: 400 },
    );
  }
  if (mode !== 'count' && mode !== 'test' && mode !== 'send') {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }

  // 申込者を取得（email で重複排除、最新の申込内容を採用）
  const recipients: { email: string; name: string; metadata: Record<string, unknown> | null }[] = [];
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('event_signups')
      .select('email, name, created_at, metadata')
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
      recipients.push({ email, name: (r.name ?? '').trim(), metadata: (r.metadata ?? null) as Record<string, unknown> | null });
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
    // テストでは申込者一覧の先頭の申込内容（あれば）で差し込みプレビュー
    const sampleMeta = recipients[0]?.metadata
      ?? (event_id === 'df-camp-2026-08'
        ? { pricing: { tierLabel: '早割（10%OFF）', amount: 67500, amountWithTax: 74250 } }
        : null);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      replyTo: REPLY_TO,
      subject: `[テスト送信] ${template.subject}`,
      html: template.build({ name: 'テスト 太郎', metadata: sampleMeta }),
    });
    if (error) {
      console.error('POST /api/event-reminder test send error:', error);
      return NextResponse.json({ error: 'send_failed', detail: String(error) }, { status: 502 });
    }
    return NextResponse.json({ tested: true, to }, { status: 200 });
  }

  // onlyEmail 指定時はその1名だけに送る（後から申し込んだ人への追い送り用）。
  // 既に全員へ送った文面を、二重送信せずに1名へ届けたいときに使う。
  // 申込者一覧にないアドレスは弾く（宛先の打ち間違い・部外者への誤送信を防ぐ）。
  let targets = recipients;
  if (typeof onlyEmail === 'string' && onlyEmail.trim()) {
    const wanted = onlyEmail.toLowerCase().trim();
    targets = recipients.filter(r => r.email === wanted);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'not_a_signup', message: `${wanted} はこのイベントの申込者一覧にありません` },
        { status: 400 },
      );
    }
  }

  // mode='send' は対象者へ（Resend batch を100件ずつ）
  if (targets.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: '対象の申込者がいません' }, { status: 200 });
  }
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    const payload = chunk.map(r => ({
      from: FROM_EMAIL,
      to: r.email,
      replyTo: REPLY_TO,
      subject: template.subject,
      html: template.build({ name: r.name || 'ご参加者', metadata: r.metadata }),
    }));
    const { error } = await resend.batch.send(payload);
    if (error) {
      console.error('POST /api/event-reminder batch error:', error);
      failed += chunk.length;
    } else {
      sent += chunk.length;
    }
  }
  return NextResponse.json({ sent, failed, total: targets.length }, { status: 200 });
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

// =============================================================
// 北軽井沢合宿 お支払い案内
// =============================================================
function buildCampPaymentHtml(name: string, metadata: Record<string, unknown> | null): string {
  const pricing = (metadata?.pricing ?? {}) as { tierLabel?: string; amount?: number; amountWithTax?: number };
  const tierLabel = typeof pricing.tierLabel === 'string' ? pricing.tierLabel : 'お申込み内容に基づくプラン';
  const amountRow = typeof pricing.amountWithTax === 'number'
    ? `<strong style="font-size:18px;">¥${pricing.amountWithTax.toLocaleString()}（税込）</strong>${typeof pricing.amount === 'number' ? `<br><span style="font-size:12px;color:#5a5880;">税抜 ¥${pricing.amount.toLocaleString()}</span>` : ''}`
    : `<span style="color:#5a5880;">お申込み内容をご確認のうえ、別途ご案内します。ご不明な場合はご返信ください。</span>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6ff;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <tr><td style="background:#1c3329;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;color:#f0b429;letter-spacing:0.15em;">DEMOCRACY FITNESS CAMP 2026</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.5;">参加費お支払いのご案内</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#1a1a2e;">${escapeHtml(name)} 様</p>

    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.9;">
      いつもお世話になっております。株式会社きづきくみたてワンダーラボの森本康仁です。<br>
      この度は「デモクラシーフィットネス キャンプ2026 in 北軽井沢」へお申込みいただき、誠にありがとうございます。お申込み時にご案内しておりました<strong>参加費のお振込先</strong>を、改めてご案内いたします。
    </p>

    <div style="background:#eef7f0;border:1px solid #cde8d4;padding:16px 20px;margin:18px 0;border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#1a1a2e;line-height:1.85;">
        🎉 このたび、<strong>早割の段階で</strong>最少催行人数（10名）に達し、<strong>無事に開催が確定</strong>いたしました。ご参加いただける皆さまに、心より感謝申し上げます。
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;font-size:13px;">
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;width:34%;color:#475569;font-weight:600;">適用プラン</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${escapeHtml(tierLabel)}</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">参加費</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">${amountRow}</td>
      </tr>
    </table>

    <div style="background:#f0f7ff;border:1px solid #cfe0f5;padding:18px 20px;margin:20px 0;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1a1a2e;">▼ お振込先</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#1a1a2e;line-height:1.9;">
        <tr><td style="padding:2px 0;width:38%;color:#5a5880;">金融機関</td><td style="padding:2px 0;">GMOあおぞらネット銀行（0310）</td></tr>
        <tr><td style="padding:2px 0;color:#5a5880;">支店</td><td style="padding:2px 0;">法人第二営業部（102）</td></tr>
        <tr><td style="padding:2px 0;color:#5a5880;">預金種別</td><td style="padding:2px 0;">普通預金</td></tr>
        <tr><td style="padding:2px 0;color:#5a5880;">口座番号</td><td style="padding:2px 0;">2205882</td></tr>
        <tr><td style="padding:2px 0;color:#5a5880;">口座名義</td><td style="padding:2px 0;">株式会社きづきくみたてワンダーラボ<br>（カ）キヅキクミタテワンダーラボ）</td></tr>
      </table>
    </div>

    <div style="background:#fef3e0;border-left:4px solid #e85d26;padding:16px 20px;margin:20px 0;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:13px;color:#1a1a2e;line-height:1.8;">
        <strong>お支払い期限：${CAMP_PAYMENT_DEADLINE}</strong><br>
        <span style="color:#475569;">上記期限までにお振込をお願いいたします。振込手数料はお客様負担にてお願いいたします。</span>
      </p>
    </div>

    <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.9;">
      ※ペアでお申込みの場合も、原則お一人ずつ上記内容でお振込みください（おまとめをご希望の場合はご返信ください）。
    </p>

    <p style="margin:18px 0 6px;font-size:14px;font-weight:700;color:#1a1a2e;">■ 当日、会場でお支払いいただくもの</p>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.9;">
      上記の参加費（事前お振込分）とは別に、<strong>食費・宿泊費・会場利用費等</strong>を当日、会場にてお支払いいただきます。最終的な金額は参加人数の確定後に確定いたしますが、ウェブサイトに記載のとおり<strong>最大で税込39,600円</strong>となります。確定しましたら、改めてお知らせいたします。
    </p>

    <p style="margin:18px 0 6px;font-size:14px;font-weight:700;color:#1a1a2e;">■ 軽井沢駅から会場までの交通について</p>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.9;">
      上記に加えて、軽井沢駅から会場までの交通費が別途必要となります。現地でタクシー等に乗り合わせができるよう、参加者の皆さまの連絡用チャットグループを作成いたします（追ってご案内します）。
    </p>

    <p style="margin:24px 0 0;font-size:14px;color:#475569;line-height:1.9;">
      合宿当日に向けた持ち物・アクセス・タイムスケジュール等の詳しいご案内は、開催が近くなりましたら改めてお送りします。<br>
      ご不明な点がございましたら、お気軽にご返信ください。当日お会いできるのを楽しみにしております。
    </p>
  </td></tr>

  <tr><td style="background:#26215C;border-radius:0 0 12px 12px;padding:22px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#ffffff;">株式会社きづきくみたてワンダーラボ　森本 康仁</p>
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

// =============================================================
// 8/11-12 合宿 事前案内（開催約2週間前）
// =============================================================
const CAMP_FB_GROUP_URL = 'https://www.facebook.com/groups/3282829055236814';
const CAMP_FB_PROFILE_URL = 'https://www.facebook.com/yasuhito.morimoto/';

function buildCampPrecampHtml(name: string): string {
  const h2 = (t: string) =>
    `<h2 style="margin:28px 0 10px;font-size:15px;font-weight:700;color:#1c3329;border-bottom:2px solid #f0b429;padding-bottom:6px;">${t}</h2>`;
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font-size:14px;color:#475569;line-height:1.9;">${t}</p>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6ff;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <tr><td style="background:#1c3329;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;color:#f0b429;letter-spacing:0.15em;">DEMOCRACY FITNESS CAMP 2026</p>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.5;">当日までのご案内</h1>
  </td></tr>

  <tr><td style="background:#ffffff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#1a1a2e;">${escapeHtml(name)} 様</p>

    ${p('デモクラシーフィットネス キャンプ2026 in 北軽井沢のお申込み、ありがとうございます。<br>開催まで約2週間となりましたので、当日までのご案内をお送りします。')}
    ${p('長めのメールですが、<strong>「持ち物」と「軽井沢駅からの移動」の2つ</strong>は当日に直結しますので、そこだけでもお目通しください。')}

    ${h2('開催概要')}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;font-size:13px;">
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;width:26%;color:#475569;font-weight:600;">日程</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">2026年8月11日（火）10:00 〜 8月12日（水）17:00</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">会場</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;">TAKIVIVA（群馬県吾妻郡・北軽井沢／軽井沢駅から車で約30分）</td>
      </tr>
      <tr>
        <th align="left" style="padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-weight:600;">集合</th>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1a1a2e;"><strong>現地集合・現地解散</strong>です。8月11日（火）10:00 に TAKIVIVA 受付にお越しください</td>
      </tr>
    </table>
    ${p('10:00 からチェックインとウェルカムドリンク、10:30 にオープニングが始まります。')}

    ${h2('軽井沢駅からの移動 — 相乗りのご相談')}
    ${p('会場までの移動は各自手配をお願いしています。東京駅から軽井沢駅までは北陸新幹線で約70分、軽井沢駅から会場までは車で約30分です。')}
    <div style="background:#fef3e0;border-left:4px solid #e85d26;padding:16px 20px;margin:0 0 16px;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:13px;color:#1a1a2e;line-height:1.85;">
        初日は <strong>10:00にオープニング</strong>が始まります。<strong>9時15分までに軽井沢駅にご到着いただく</strong>と、余裕をもって会場入りできます。新幹線をご予約の際の目安になさってください。<br><br>
        2日目は <strong>17:00に解散</strong>です。会場から軽井沢駅まで車で約30分かかりますので、お帰りの新幹線は <strong>17:40以降</strong>を目安にご予約ください。
      </p>
    </div>
    ${p('現時点で、<strong>お車で来られる方が4〜5名、相乗りやタクシーの乗り合わせをご希望の方が3名</strong>いらっしゃいます。')}
    ${p('移動の相談だけでなく、持ち物や当日のことなど、<strong>複数のテーマごとにやりとりしやすいよう、Facebookのグループページ</strong>をご用意しました。')}
    <p style="margin:0 0 14px;font-size:14px;color:#475569;line-height:1.9;">
      👉 <strong>参加者グループはこちら</strong><br>
      <a href="${CAMP_FB_GROUP_URL}" style="color:#e85d26;">${CAMP_FB_GROUP_URL}</a>
    </p>
    <p style="margin:0 0 14px;font-size:14px;color:#475569;line-height:1.9;">
      なお、<strong>私（森本康仁）とFacebookで繋がりがない方は、こちらのアカウントに友達申請をいただけますでしょうか。</strong><br>
      <a href="${CAMP_FB_PROFILE_URL}" style="color:#e85d26;">${CAMP_FB_PROFILE_URL}</a>
    </p>
    ${p('グループでは到着時刻を共有していただき、乗り合わせを相談できればと思います。お車で来られる方で「同乗者を乗せられる」という方は、ぜひその旨をお書きください。')}

    <div style="background:#f1f5f9;border-radius:8px;padding:18px 20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1c3329;">Facebookをお使いでない方へ</p>
      <p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.85;">
        <strong>Facebookのアカウントをお持ちでない方、普段お使いでない方も、まったく問題ありません。</strong>グループはあくまで相談をしやすくするための場で、参加は任意です。
      </p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.85;">
        その場合は、<strong>このメールへの返信で、当日の到着予定時刻（または「まだ未定」）だけお知らせいただけますでしょうか。</strong>こちらで相乗りの調整に入れさせていただきます。グループ内で移動に関する大事な決定があった場合も、私から個別にメールでお伝えしますので、情報から漏れるご心配はありません。
      </p>
    </div>
    ${p('うまく相乗りが決まらない場合も、遠慮なく私（森本）までご連絡ください。タクシーの手配をご一緒に考えます。')}

    ${h2('持ち物')}
    <ul style="margin:0 0 14px;padding-left:20px;font-size:14px;color:#475569;line-height:1.9;">
      <li><strong>動きやすい服装と動きやすい靴</strong> — 立って動くワークや、屋外で過ごす時間があります</li>
      <li><strong>羽織れるもの・薄手の防寒具</strong> — 北軽井沢の夜は夏でも涼しく、例年15℃前後まで冷え込むことがあります</li>
      <li><strong>スリッパやサンダル</strong> — 館内でリラックスして過ごせます</li>
      <li><strong>寝巻き・歯ブラシなど</strong> — 寝具とタオル類は会場で用意されます</li>
      <li>お気に入りのノートがあれば（筆記用具は会場にもあります）</li>
    </ul>

    ${h2('お支払いについて')}
    ${p(`<strong>プログラム参加費</strong> — 別途お送りしている振込案内のとおりです。まだお振込みがお済みでない方は、<strong>${CAMP_PAYMENT_DEADLINE}</strong>までにお願いいたします。`)}
    ${p('<strong>宿泊費・食事代</strong> — 当日、<strong>TAKIVIVA受付にて直接ご精算</strong>いただきます（現金・クレジットカード等）。確定金額は当日受付でご案内します。')}
    ${p('なお、ご自宅から通われる方・宿泊されない方が数名いらっしゃいます。その場合の食事代の精算方法も当日受付でご案内できるよう、会場と調整しています。')}

    ${h2('お食事について')}
    ${p('1日目の昼・夕、2日目の朝・昼の計4回、TAKIVIVA でご用意します。夕食と朝食は地域の食材を活かして厨房で調理され、ランチは外部手配のお弁当です。')}
    ${p(`アレルギーや食事制限のあるお申し出は会場に共有済みです。<strong>お申込み後に体調や食事制限に変化があった方は、${CAMP_PAYMENT_DEADLINE}までにこのメールへの返信でお知らせください。</strong>`)}
    ${p('厨房を共有して調理する都合上、お一人分だけ食材を抜いた別料理をご用意することが難しい場合があります。使用食材はできる限りお伝えしますので、最終的にはご自身でご判断いただき、必要に応じて別途お食事をご用意いただく形になる可能性があります。あらかじめご了承ください。')}

    ${h2('2日間の流れ')}
    <p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.9;">
      <strong style="color:#1c3329;">1日目（8/11 火）</strong><br>
      10:00 チェックイン ／ 10:30 オープニング ／ 12:00 ランチ ／ 13:30 好奇心筋・傾聴筋・共感筋 ／ 15:50 勇気筋・意見筋・反対意見表明筋 ／ 18:30 夕食 ／ 20:00 焚き火対話（自由参加）
    </p>
    <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.9;">
      <strong style="color:#1c3329;">2日目（8/12 水）</strong><br>
      7:00 朝の散歩 ／ 8:00 朝食 ／ 9:30 言葉への自信筋・妥協筋 ／ 12:00 ランチ ／ 13:30 活動家筋・動員筋 ／ 15:30 統合ワーク ／ 16:30 クロージング（17:00 解散）
    </p>
    ${p('夜の焚き火対話は自由参加です。ゆっくり休まれても構いません。')}

    ${h2('1ヶ月後のオンラインセッションについて')}
    ${p('合宿から1ヶ月ほど後に、Zoom で2時間の振り返りセッションを行います（参加費に含まれます）。日程は皆さんと調整して決めますので、<strong>合宿当日に候補日をご相談させてください。</strong>')}

    ${h2('当日までのご連絡')}
    ${p('ご質問・ご相談は、このメールへの返信または <a href="mailto:y.morimoto@kizukikumitate.com" style="color:#e85d26;">y.morimoto@kizukikumitate.com</a> までお気軽にどうぞ。開催前日にも、あらためて当日のご案内をお送りします。')}
    ${p('森の中で皆さんにお会いできるのを楽しみにしています。')}
  </td></tr>

  <tr><td style="background:#26215C;border-radius:0 0 12px 12px;padding:22px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#ffffff;">株式会社きづきくみたてワンダーラボ　森本 康仁</p>
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
