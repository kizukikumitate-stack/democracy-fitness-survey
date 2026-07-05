import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// 妖怪と式神 診断の集計を返す公開エンドポイント(ランキングページ用)。
// 個人情報は含まない集計値のみ。テーブル/ビュー: supabase/create_yokai_responses.sql

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

type RankRow = { yokai_id: number; n: number };

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error('GET /api/yokai-stats admin init error:', e);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
  }

  try {
    const [mainRes, appearRes, totalRes] = await Promise.all([
      admin.from('yokai_main_ranking').select('yokai_id, n'),
      admin.from('yokai_appearance_ranking').select('yokai_id, n'),
      admin.from('yokai_responses').select('id', { count: 'exact', head: true }),
    ]);

    if (mainRes.error || appearRes.error || totalRes.error) {
      console.error('GET /api/yokai-stats query error:', mainRes.error || appearRes.error || totalRes.error);
      return NextResponse.json({ error: 'query_failed' }, { status: 500, headers: cors });
    }

    const main = (mainRes.data ?? []) as RankRow[];
    const appearance = (appearRes.data ?? []) as RankRow[];
    const total = totalRes.count ?? 0;
    const mainSum = main.reduce((acc, r) => acc + r.n, 0);
    const noYokai = Math.max(0, total - mainSum); // 妖怪ゼロ(式神が機能)の件数

    return NextResponse.json(
      {
        total,
        noYokai,
        main: main.sort((a, b) => b.n - a.n),
        appearance: appearance.sort((a, b) => b.n - a.n),
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { ...cors, 'Cache-Control': 'public, max-age=60, s-maxage=60' },
      },
    );
  } catch (err) {
    console.error('GET /api/yokai-stats error:', err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500, headers: cors });
  }
}
