import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// 公開ギャラリー用: 森本が承認(status='approved')した投稿だけを返す。
// pending / rejected は絶対に返さない。匿名(個人情報なし)。
// テーブル定義: supabase/create_yokai_submissions.sql

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

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error('GET /api/yokai-gallery admin init error:', e);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
  }

  try {
    const { data, error } = await admin
      .from('yokai_submissions')
      .select('name, description, kuse, source, approved_at, display_order')
      .eq('status', 'approved')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('approved_at', { ascending: false })
      .limit(300);

    if (error) {
      console.error('GET /api/yokai-gallery query error:', error);
      return NextResponse.json({ error: 'query_failed' }, { status: 500, headers: cors });
    }

    return NextResponse.json(
      { items: data ?? [] },
      { status: 200, headers: { ...cors, 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    );
  } catch (err) {
    console.error('GET /api/yokai-gallery error:', err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500, headers: cors });
  }
}
