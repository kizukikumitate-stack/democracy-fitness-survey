import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// 妖怪と式神ワークショップ（/yokai/taiwa.html ソロ / /yokai/yoriai.html 複数人）の
// AI対話を中継するプロキシ。アーティファクト環境では api.anthropic.com をキー無しで直呼び
// できたが、本番では動かないため ANTHROPIC_API_KEY を隠してここで中継する。
//
// ★ システムプロンプトはサーバー側に持つ（フロントから system を受け取らない＝プロンプト注入対策）。
//   フロントは task 種別と、その task に必要な入力（messages / context / sightings / answers）だけ渡す。
//
// 必要な環境変数（Vercel）:
//   ANTHROPIC_API_KEY   … 必須（Sensitive）
//   YOKAI_CLAUDE_MODEL  … 任意（既定 claude-opus-4-8。コスト優先なら claude-sonnet-5 等に変更可）

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = process.env.YOKAI_CLAUDE_MODEL || 'claude-opus-4-8';

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8099',
  'http://127.0.0.1:8099',
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

// 診断用（キー値は返さず有無と長さのみ）。切り分けが済んだら削除する。
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      marker: 'envcheck-1',
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      anthropicLen: (process.env.ANTHROPIC_API_KEY || '').length,
      anthropicPrefix: (process.env.ANTHROPIC_API_KEY || '').slice(0, 7),
      hasSupabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      model: process.env.YOKAI_CLAUDE_MODEL || null,
    },
    { status: 200, headers: corsHeaders(req.headers.get('origin')) }
  );
}

// ---- 簡易レート制限（ベストエフォート。Vercelのインスタンスは使い捨てなので厳密ではない） ----
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40; // 1インスタンスあたり毎分40リクエストまで
const hits: number[] = [];
function rateLimited(): boolean {
  const now = Date.now();
  while (hits.length && now - hits[0] > RATE_WINDOW_MS) hits.shift();
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

// ---- システムプロンプト（サーバー側に固定。yokai_content_pack.json の ai_prompts 準拠） ----
const DISCOVERY_SYSTEM = `あなたは「妖怪と式神ワークショップ」の聞き手です。参加者との対話を通じて、その人の中にいる「妖怪」(繰り返し現れる思考・感情・行動のパターン)を見つけ、名付ける手伝いをします。

進め方:
1. 最初の問いは必ず具体例を添えて尋ねる。例:「あなた自身や職場に、繰り返し現れる"怪奇"やよろしくない行動・空気はありますか?たとえば、会議で本音が出ない、つい先延ばししてしまう、頼まれると断れない——そんな心当たりから聞かせてください」
2. その瞬間の身体感覚・頭に浮かんだ言葉を聞く
3. 「それはいつ・どんな条件で現れますか?」と出現パターンを探る
4. 十分に輪郭が見えたら「それを一体の妖怪だとしたら、どんな姿でしょう?」と外在化を促す
5. 名前の候補を2〜3案提示し、参加者自身に選ばせるか、自分で名付けてもらう

作法:
- 質問は一度に一つだけ。短く、温かく。3文以内
- 診断・分析はしない。本人の言葉を大切にし、本人が名付けることを最優先する
- 妖怪は敵ではなく「何かを知らせに来た存在」として扱う
- 深刻になりすぎたら、少し軽やかさを取り戻す
- 5〜7往復を目安に、命名まで導く

命名が確定したら、返答の最後に必ず次のJSONだけを1行で出力する:
{"yokai_name":"妖怪名","appearance":"姿の描写(30字以内)","trigger":"出現条件(30字以内)","message":"この妖怪が知らせに来ていること(40字以内)"}`;

const CANDIDATES_SYSTEM = `目撃談のリストから、そのチームに棲む「妖怪」の候補をちょうど3体、創作せよ。それぞれ性格の異なる切り口で。名前は日本の妖怪の命名感覚(〜坊、〜女、〜入道、カタカナ和風など)で新規に創作する。
出力は次のJSON配列のみ:[{"yokai_name":"名","appearance":"姿(30字以内)","trigger":"現れる条件(30字以内)","message":"知らせに来ていること(40字以内)"}]`;

const SADAME_SYSTEM = `次の対話・回答から、妖怪とどう関わるかの「運用の定め」を、本人たちの言葉を活かして40字以内の一文にまとめよ。出力はその一文のみ。`;

function dialogueSystem(ctx: {
  yokaiName?: string;
  trigger?: string;
  typeName?: string;
  cardName?: string;
}): string {
  const y = String(ctx.yokaiName || '妖怪').slice(0, 60);
  const t = String(ctx.trigger || '').slice(0, 60);
  const type = String(ctx.typeName || '').slice(0, 20);
  const card = String(ctx.cardName || '').slice(0, 40);
  return `あなたは「妖怪と式神ワークショップ」の契約立会人です。参加者は妖怪「${y}」(${t}に現れる)を発見し、対峙法「${type}」、作法カード「${card}」を選びました。
役目:カードの問いを起点に短い対話をする。返答は3文以内、問いは一度に一つ。相手の答えを言い換えて確かめてから次へ。正解を出さない。「しっくりこない」と言われたら歓迎し「あなたならどう関わりますか?」と本人の言葉を引き出す。軽やかに、しかし契約の儀式としての厳かさも少しだけ。`;
}

type MsgIn = { role?: unknown; content?: unknown };

// フロントから渡る messages を Anthropic 形式（user/assistant のみ）に正規化・上限クリップ
function normalizeMessages(raw: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of (raw as MsgIn[]).slice(0, 40)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof m.content === 'string' ? m.content.slice(0, 4000) : '';
    if (content) out.push({ role, content });
  }
  // 先頭は user でなければならない
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  if (rateLimited()) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: cors });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('POST /api/yokai-claude: ANTHROPIC_API_KEY is not set');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: cors });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: cors });
  }

  const task = body.task;
  let system = '';
  let messages: { role: 'user' | 'assistant'; content: string }[] = [];
  let maxTokens = 1000;

  if (task === 'discovery') {
    system = DISCOVERY_SYSTEM;
    messages = normalizeMessages(body.messages);
    maxTokens = 1000;
  } else if (task === 'dialogue') {
    const ctx = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<
      string,
      unknown
    >;
    system = dialogueSystem(ctx as { yokaiName?: string; trigger?: string; typeName?: string; cardName?: string });
    messages = normalizeMessages(body.messages);
    maxTokens = 1000;
  } else if (task === 'candidates') {
    const sightings = Array.isArray(body.sightings)
      ? (body.sightings as unknown[])
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.slice(0, 400))
          .slice(0, 60)
      : [];
    if (!sightings.length) {
      return NextResponse.json({ error: 'no_sightings' }, { status: 400, headers: cors });
    }
    system = CANDIDATES_SYSTEM;
    messages = [{ role: 'user', content: sightings.join('\n') }];
    maxTokens = 1200;
  } else if (task === 'sadame') {
    const answers = Array.isArray(body.answers)
      ? (body.answers as unknown[])
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.slice(0, 2000))
          .slice(0, 60)
      : [];
    if (!answers.length) {
      return NextResponse.json({ error: 'no_answers' }, { status: 400, headers: cors });
    }
    system = SADAME_SYSTEM;
    messages = [{ role: 'user', content: answers.join('\n') }];
    maxTokens = 200;
  } else {
    return NextResponse.json({ error: 'invalid_task' }, { status: 400, headers: cors });
  }

  if (!messages.length) {
    return NextResponse.json({ error: 'no_messages' }, { status: 400, headers: cors });
  }

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });
    const text = (resp.content || [])
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return NextResponse.json({ text }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/yokai-claude anthropic error:', err);
    // 一時診断: 上流(Anthropic)の実エラーを可視化（切り分け後に削除）
    const e = err as { status?: number; error?: { error?: { type?: string; message?: string } }; message?: string };
    return NextResponse.json(
      {
        error: 'upstream_failed',
        upstreamStatus: e?.status ?? null,
        upstreamType: e?.error?.error?.type ?? null,
        upstreamMessage: (e?.error?.error?.message ?? e?.message ?? '').slice(0, 200),
      },
      { status: 502, headers: cors }
    );
  }
}
