import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// 「ロケットの中」(/rocket-inside.html) の「みんなでつくる乗組員」投稿を受けるルート。
// 読者が「こんなエージェントがいたら」を書いて送ると、森本さんにメールで届く。
//
// ★ 保存はしない（DB非依存）。届いたメールが台帳。
// ★ 返信用メールは任意。書かれていれば Reply-To に入れる。
//
// 必要な環境変数（Vercel）:
//   RESEND_API_KEY      … 必須（既存・Sensitive）
//   RESEND_FROM_EMAIL   … 任意（既定 onboarding@resend.dev）
//   RESEND_ADMIN_EMAIL  … 任意（既定 y.morimoto@kizukikumitate.com）

export const runtime = 'nodejs';
export const maxDuration = 15;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const ADMIN_NOTIFY_EMAIL = process.env.RESEND_ADMIN_EMAIL ?? 'y.morimoto@kizukikumitate.com';

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
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

/** 上限つきで文字列化する。改行以外の制御文字は空白に落とす。 */
function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ').trim().slice(0, max);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FAMILIES: Record<string, string> = {
  warrior: '戦士系（現場・実行）',
  mage: '魔法使い系（専門知識）',
  priest: '僧侶系（対人支援）',
  merchant: '商人系（ビジネス・企画）',
  artist: '遊び人系（クリエイティブ）',
  '': 'おまかせ',
};

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400, headers });
  }

  // ハニーポット: 人間には見えない項目。埋まっていたら黙って成功を返す
  if (clean(body.company, 100)) {
    return NextResponse.json({ ok: true }, { headers });
  }

  const name = clean(body.name, 60);
  const job = clean(body.job, 1200);
  const family = clean(body.family, 20);
  const avoid = clean(body.avoid, 800);
  const sender = clean(body.sender, 60);
  const email = clean(body.email, 200);

  if (!name || !job) {
    return NextResponse.json(
      { ok: false, error: 'エージェント名と、どんな仕事をしてほしいかは必須です' },
      { status: 400, headers },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[agent-suggest] RESEND_API_KEY が未設定');
    return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500, headers });
  }

  const famLabel = FAMILIES[family] ?? 'おまかせ';
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '';

  const html = `
    <div style="font-family:sans-serif;line-height:1.8;color:#16132a">
      <h2 style="font-size:16px;margin:0 0 12px">🚀 乗組員デッキに投稿がありました</h2>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#5a6a7a;vertical-align:top">エージェント名</td><td style="padding:4px 0"><b>${esc(name)}</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5a6a7a;vertical-align:top">系統</td><td style="padding:4px 0">${esc(famLabel)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5a6a7a;vertical-align:top">してほしい仕事</td><td style="padding:4px 0;white-space:pre-wrap">${esc(job)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5a6a7a;vertical-align:top">やらないでほしいこと</td><td style="padding:4px 0;white-space:pre-wrap">${esc(avoid) || '<span style="color:#8a86a0">（記入なし）</span>'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5a6a7a;vertical-align:top">お名前</td><td style="padding:4px 0">${esc(sender) || '<span style="color:#8a86a0">（記入なし）</span>'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5a6a7a;vertical-align:top">返信先</td><td style="padding:4px 0">${esc(validEmail) || '<span style="color:#8a86a0">（記入なし）</span>'}</td></tr>
      </table>
      <p style="font-size:12px;color:#8a86a0;margin-top:16px">
        送信元: ${esc(origin || '不明')}<br>
        ※ この投稿はどこにも保存していません。このメールが控えです。
      </p>
    </div>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: `【乗組員デッキ】投稿: ${name}`,
      html,
      ...(validEmail ? { replyTo: validEmail } : {}),
    });
    if (error) {
      console.error('[agent-suggest] Resend エラー', error);
      return NextResponse.json({ ok: false, error: 'mail failed' }, { status: 502, headers });
    }
  } catch (e) {
    console.error('[agent-suggest] 送信で例外', e);
    return NextResponse.json({ ok: false, error: 'mail failed' }, { status: 502, headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}
