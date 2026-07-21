import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// 「転職の書」(/tenshoku-no-sho.html) の「みんなでつくる」ライト入力を中継するプロキシ。
// 職業名＋一言(＋任意で系統/階層)だけを受け取り、ジョブカードの下書きJSONを返す。
// フロントはこの下書きでフォームを埋め、本人が確認・修正してから「書に加える」。
//
// ★ システムプロンプトはサーバー側に固定（フロントから system を受け取らない＝注入対策）。
// ★ AIは下書きを作るだけ。追加の可否・最終的な★の値は本人が決める（教材の設計思想）。
//
// 必要な環境変数（Vercel）:
//   ANTHROPIC_API_KEY      … 必須（Sensitive・yokai-claude と共用）
//   TENSHOKU_CLAUDE_MODEL  … 任意（既定 claude-haiku-4-5。下書き用途なので速さ優先）

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = process.env.TENSHOKU_CLAUDE_MODEL || 'claude-haiku-4-5';

const ALLOWED_ORIGINS = [
  'https://kizukikumitate.com',
  'https://kizukikumitate-stack.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:8782',
  'http://127.0.0.1:8782',
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

// ---- 簡易レート制限（ベストエフォート。Vercelインスタンスは使い捨てなので厳密ではない） ----
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // 1インスタンスあたり毎分30リクエストまで
const hits: number[] = [];
function rateLimited(): boolean {
  const now = Date.now();
  while (hits.length && now - hits[0] > RATE_WINDOW_MS) hits.shift();
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

const SYSTEM = `あなたは、はたらく職業をRPGドラクエ風の「ジョブカード」にする教材「転職の書」の下書き係です。
渡された「職業名」と「一言メモ」から、その職業のジョブカードの下書きを作り、指定のJSONだけを1個出力してください。

出力するJSONのフィールド（すべて必須。JSON以外の文字・説明・コードフェンスは一切出力しない）:
{
 "family": "warrior|mage|priest|merchant|artist のいずれか1つ",
 "tier": "base か adv のいずれか",
 "catch": "RPG風のキャッチコピー。全角30字以内。体言止め可",
 "skills": {"taijin":1-5,"bunseki":1-5,"jikko":1-5,"souzou":1-5,"nintai":1-5},
 "rewards": {"gold":1-5,"heart":1-5,"time":1-5,"exp":1-5},
 "tech": [["技名","20字前後の説明"],["技名","説明"],["技名","説明"]],
 "study": "まなぶことの例（30字以内）",
 "cert": "おすすめ資格。無ければ「特になし」",
 "hours": "学習時間の目安（例: 独学約200時間 / 養成校2年）",
 "sal": "平均年収の目安（例: 約400万円。幅があれば範囲で）"
}

系統(family)の意味: warrior=現場・実行(戦士系) / mage=専門知識(魔法使い系) / priest=対人支援(僧侶系) / merchant=ビジネス・企画(商人系) / artist=クリエイティブ(遊び人系)。最もしっくりくる1つを選ぶ。
階層(tier): base=基本職(今の職業からスタートできる) / adv=上位職(2つの職の掛け合わせや国家資格の関門を越えた職)。迷ったら base。
skills: taijin=対人力 bunseki=分析力 jikko=実行力 souzou=創造力 nintai=忍耐力。1〜5の整数。
rewards: gold=収入 heart=やりがい time=時間の自由 exp=市場価値。1〜5の整数。年収や休日の一般的な目安から控えめに見積もる（あくまで目安）。
tech(とくぎ): その職業を象徴する技を3つ。RPGの技名っぽく、でも実際の仕事内容がわかるように。

トーン: 中立でユーモアがある。「倒す」「乗り越える」「敵」などの対決・攻撃の語は使わない（職業を戦士・魔法使い等に例えるRPG比喩はOK）。特定の会社・業界を名指しで貶めない。数値は断定せず一般的な目安として控えめに。`;

function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  if (rateLimited()) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: cors });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('POST /api/tenshoku-draft: ANTHROPIC_API_KEY is not set');
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

  const name = clampStr(body.name, 60).trim();
  if (!name) {
    return NextResponse.json({ error: 'no_name' }, { status: 400, headers: cors });
  }
  const hint = clampStr(body.hint, 1200).trim();

  const FAMILIES = ['warrior', 'mage', 'priest', 'merchant', 'artist'];
  const famIn = clampStr(body.family, 20);
  const tierIn = clampStr(body.tier, 10);
  const familyHint = FAMILIES.includes(famIn) ? famIn : '';
  const tierHint = tierIn === 'base' || tierIn === 'adv' ? tierIn : '';

  const userLines = [
    `職業名: ${name}`,
    hint ? `一言メモ: ${hint}` : '一言メモ: (なし。職業名から一般的な内容で補ってください)',
  ];
  if (familyHint) userLines.push(`系統の指定: ${familyHint}（これを使う）`);
  if (tierHint) userLines.push(`階層の指定: ${tierHint}（これを使う）`);
  userLines.push('この職業のジョブカードの下書きを、指定のJSONだけで出力してください。');

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: 'user', content: userLines.join('\n') }],
    });
    const text = (resp.content || [])
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return NextResponse.json({ text }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/tenshoku-draft anthropic error:', err);
    return NextResponse.json({ error: 'upstream_failed' }, { status: 502, headers: cors });
  }
}
