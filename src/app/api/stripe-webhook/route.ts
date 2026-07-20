import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// Stripe の署名検証には「生のリクエストボディ」が必要なので、
// Edge ランタイムやボディの自動パースに載せない。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';
const SUPPORT_EMAIL = 'y.morimoto@kizukikumitate.com';

/**
 * 商品レジストリ。
 *
 * Stripe の Checkout Session から取得した明細（line items）の商品名に `match` が
 * 含まれていたら、その商品のダウンロード案内を送る。
 *
 * ここに載っていない商品の決済では **メールを送らない**（200 は返す）。
 * 新しい有料商品を Stripe に追加したら、必ずこの配列に1エントリ足すこと。
 * 足し忘れると購入者に何も届かないので、追加時は必ずテストモードで1回通す。
 */
type KitProduct = {
  /** 商品名の部分一致キーワード（Stripe 側の商品名を変えたらここも直す） */
  match: string;
  /** メール件名・本文に出す正式名称 */
  name: string;
  /** 購入者専用ダウンロードページ（noindex・推測不可URL） */
  downloadUrl: string;
  /** 同梱物の一覧（メール本文に箇条書きで出す） */
  contents: string[];
};

const PRODUCTS: KitProduct[] = [
  {
    match: '昇給交渉キット',
    name: '昇給交渉キット 一式',
    downloadUrl: 'https://kizukikumitate.com/salary-kit-dl-92kf7m/',
    contents: [
      'マインドセット・状態構築編（PDF）',
      '事例集 日本編（PDF）',
      '上司に渡すワンページャー（Word テンプレート）',
    ],
  },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 購入者向けメールHTML。
 * メールクライアント（Gmail/Outlook 等）はCSSの対応が古いので、
 * テーブルレイアウト＋インラインスタイルで組む。
 */
function buildBuyerHtml(product: KitProduct, name: string | null): string {
  const greeting = name ? `${escapeHtml(name)} 様` : 'お客様';
  const items = product.contents
    .map(
      (c) =>
        `<tr><td style="padding:4px 0;font-size:14px;color:#333333;line-height:1.7;">・${escapeHtml(c)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<body style="margin:0;padding:0;background-color:#f4f3ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f3ef;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;padding:32px 28px;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;">

  <tr><td style="font-size:12px;font-weight:bold;letter-spacing:0.12em;color:#2a78d6;padding-bottom:14px;">
    DEMOCRACY FITNESS ／ きづきくみたて工房
  </td></tr>

  <tr><td style="font-size:20px;font-weight:bold;color:#111111;line-height:1.5;padding-bottom:16px;">
    ${escapeHtml(product.name)}のダウンロード
  </td></tr>

  <tr><td style="font-size:14px;color:#333333;line-height:1.8;padding-bottom:20px;">
    ${greeting}<br><br>
    このたびはご購入いただきありがとうございます。<br>
    下のボタンから、キット一式をダウンロードしてください。<strong>何度でもダウンロードできます</strong>ので、このメールは削除せずに保管しておいてください。
  </td></tr>

  <tr><td align="center" style="padding:6px 0 24px;">
    <a href="${product.downloadUrl}" style="display:inline-block;background-color:#2a78d6;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 32px;border-radius:999px;">
      ダウンロードページを開く
    </a>
  </td></tr>

  <tr><td style="font-size:12px;color:#777777;line-height:1.7;padding-bottom:22px;word-break:break-all;">
    ボタンが開けない場合は、こちらのURLをブラウザに貼り付けてください：<br>
    <a href="${product.downloadUrl}" style="color:#2a78d6;">${product.downloadUrl}</a>
  </td></tr>

  <tr><td style="border-top:1px solid #e5e5e5;padding-top:20px;font-size:13px;font-weight:bold;color:#111111;padding-bottom:6px;">
    同梱物
  </td></tr>
  <tr><td style="padding-bottom:22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">${items}</table>
  </td></tr>

  <tr><td style="background-color:#f7f7f5;border-radius:8px;padding:16px 18px;font-size:13px;color:#444444;line-height:1.7;">
    うまく開けないときや、ファイルが壊れているときは、このメールにそのまま返信してください。ファイルを直接お送りします。
  </td></tr>

  <tr><td style="padding-top:24px;font-size:12px;color:#999999;line-height:1.7;">
    ダウンロードページと配布ファイルは、ご購入者様向けです。再配布はご遠慮ください。<br>
    お問い合わせ：<a href="mailto:${SUPPORT_EMAIL}" style="color:#777777;">${SUPPORT_EMAIL}</a><br>
    きづきくみたて工房
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildAdminHtml(
  product: KitProduct,
  email: string,
  name: string | null,
  amount: string,
  sessionId: string
): string {
  const rows: [string, string][] = [
    ['商品', product.name],
    ['購入者', email],
    ['お名前', name ?? '（未取得）'],
    ['金額', amount],
    ['Session', sessionId],
  ];
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><th align="left" style="padding:6px 12px 6px 0;font-size:13px;color:#666;white-space:nowrap;">${escapeHtml(k)}</th><td style="padding:6px 0;font-size:13px;color:#111;word-break:break-all;">${escapeHtml(v)}</td></tr>`
    )
    .join('');
  return `<html><body style="font-family:'Hiragino Sans',sans-serif;">
<p style="font-size:15px;font-weight:bold;">キットが1件売れました</p>
<table cellpadding="0" cellspacing="0" border="0">${body}</table>
<p style="font-size:12px;color:#888;">購入者へのダウンロード案内メールは自動送信済みです。</p>
</body></html>`;
}

export async function POST(req: NextRequest) {
  // --- 1. 必須の環境変数 ---
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeSecretKey) {
    console.error('POST /api/stripe-webhook: STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY が未設定');
    // 500 を返すと Stripe がリトライしてくれる（設定後に自動で復旧する）
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  // --- 2. 署名検証（これが無いと誰でも偽の購入を投げてキットを盗める） ---
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('POST /api/stripe-webhook: 署名検証に失敗', err);
    // 署名が合わない＝偽リクエスト。リトライさせたくないので 400。
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    // 購読していないイベントは黙って 200（Stripe 側で再送させない）
    return NextResponse.json({ received: true, ignored: event.type }, { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // 未払いのまま完了扱いになるケース（銀行振込等）は、入金前にキットを渡さない
  if (session.payment_status !== 'paid') {
    console.warn(`POST /api/stripe-webhook: payment_status=${session.payment_status} のため送信スキップ`, session.id);
    return NextResponse.json({ received: true, skipped: 'unpaid' }, { status: 200 });
  }

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const name = session.customer_details?.name ?? null;

  if (!email) {
    // メアドが取れないと届けようがない。管理者に知らせて手動対応に回す。
    console.error('POST /api/stripe-webhook: メールアドレスが取得できません', session.id);
    await notifyAdminFailure(`メールアドレスが取得できませんでした（Session: ${session.id}）`);
    return NextResponse.json({ received: true, skipped: 'no-email' }, { status: 200 });
  }

  // --- 3. 何が売れたのかを明細から判定する ---
  let product: KitProduct | undefined;
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
    const labels = lineItems.data.map((li) => li.description ?? '').join(' / ');
    product = PRODUCTS.find((p) => labels.includes(p.match));
    if (!product) {
      console.warn(`POST /api/stripe-webhook: レジストリ未登録の商品です: "${labels}"`, session.id);
      await notifyAdminFailure(
        `レジストリに無い商品が購入されました。PRODUCTS への追加が必要です。\n商品名: ${labels}\nSession: ${session.id}\n購入者: ${email}`
      );
      return NextResponse.json({ received: true, skipped: 'unknown-product' }, { status: 200 });
    }
  } catch (err) {
    console.error('POST /api/stripe-webhook: 明細の取得に失敗', err);
    // ここで 500 を返すと Stripe が自動リトライしてくれる
    return NextResponse.json({ error: 'Failed to read line items' }, { status: 500 });
  }

  // --- 4. 購入者にダウンロード案内を送る（本題） ---
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('POST /api/stripe-webhook: RESEND_API_KEY が未設定');
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
  }
  const resend = new Resend(resendApiKey);

  const { error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    replyTo: SUPPORT_EMAIL,
    subject: `【ダウンロード】${product.name}｜きづきくみたて工房`,
    html: buildBuyerHtml(product, name),
  });

  if (sendError) {
    console.error('POST /api/stripe-webhook: Resend 送信エラー', sendError);
    await notifyAdminFailure(
      `購入者へのメール送信に失敗しました。手動でダウンロードURLを送ってください。\n購入者: ${email}\n商品: ${product.name}\nURL: ${product.downloadUrl}\nSession: ${session.id}`
    );
    // 500 で返して Stripe にリトライさせる（一時的な障害なら自動で復旧する）
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
  }

  // --- 5. 以降は失敗してもキットは届いているので、握りつぶして 200 を返す ---
  const amountLabel =
    session.amount_total != null
      ? `${(session.currency ?? 'jpy').toUpperCase()} ${session.amount_total.toLocaleString('ja-JP')}`
      : '（不明）';

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: `【売上】${product.name} が1件売れました`,
      html: buildAdminHtml(product, email, name, amountLabel, session.id),
    });
  } catch (err) {
    console.error('POST /api/stripe-webhook: 管理者通知の送信に失敗', err);
  }

  // 顧客マスタ（CRM）への記録。スキーマ差異で落ちてもメールは届いているので続行する。
  try {
    await recordCustomer(email, name);
  } catch (err) {
    console.error('POST /api/stripe-webhook: customers 記録に失敗', err);
  }

  return NextResponse.json({ received: true, sent: true }, { status: 200 });
}

/** 障害時に管理者へ知らせる。ここが失敗しても本処理は止めない。 */
async function notifyAdminFailure(message: string): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    await new Resend(apiKey).emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: '【要対応】キット購入の自動送信で問題が発生しました',
      html: `<pre style="font-family:'Hiragino Sans',sans-serif;font-size:13px;white-space:pre-wrap;">${escapeHtml(message)}</pre>`,
    });
  } catch (err) {
    console.error('POST /api/stripe-webhook: 管理者への障害通知に失敗', err);
  }
}

/** customers テーブルに購入者を記録（新規なら INSERT、既存なら last_seen_at を更新）。 */
async function recordCustomer(email: string, name: string | null): Promise<void> {
  const admin = createSupabaseAdminClient();
  const emailNormalized = email.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const { data: existing, error: selErr } = await admin
    .from('customers')
    .select('email, name')
    .eq('email', emailNormalized)
    .maybeSingle();
  if (selErr) {
    console.error('POST /api/stripe-webhook customers select error:', selErr);
    return;
  }

  if (existing) {
    const updates: Record<string, unknown> = { last_seen_at: nowIso };
    if (!existing.name && name) updates.name = name;
    const { error } = await admin.from('customers').update(updates).eq('email', emailNormalized);
    if (error) console.error('POST /api/stripe-webhook customers update error:', error);
  } else {
    const { error } = await admin.from('customers').insert({
      email: emailNormalized,
      name,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });
    if (error) console.error('POST /api/stripe-webhook customers insert error:', error);
  }
}
