import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// 妖怪と式神 診断(/yokai/) の結果を匿名で1件記録するエンドポイント。
// 個人情報は受け取らない。「日本の組織にどの妖怪が多いか」の集計用。
// テーブル定義: supabase/create_yokai_responses.sql

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

type HitInput = { id: unknown; count: unknown };

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }

    const { mainId, hits, source } = body as {
      mainId?: unknown;
      hits?: unknown;
      source?: unknown;
    };

    // mainId: null か 1..10 の整数
    let mainYokaiId: number | null = null;
    if (mainId !== null && mainId !== undefined) {
      if (typeof mainId !== 'number' || !Number.isInteger(mainId) || mainId < 1 || mainId > 10) {
        return NextResponse.json({ error: 'Invalid mainId' }, { status: 400, headers: cors });
      }
      mainYokaiId = mainId;
    }

    // hits: [{id:1..10, count:1..10}] 最大10件、id重複不可
    if (!Array.isArray(hits) || hits.length > 10) {
      return NextResponse.json({ error: 'Invalid hits' }, { status: 400, headers: cors });
    }
    const seen = new Set<number>();
    const cleanHits: { id: number; count: number }[] = [];
    for (const h of hits as HitInput[]) {
      if (!h || typeof h !== 'object') {
        return NextResponse.json({ error: 'Invalid hit item' }, { status: 400, headers: cors });
      }
      const id = h.id;
      const count = h.count;
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 10 || seen.has(id)) {
        return NextResponse.json({ error: 'Invalid hit id' }, { status: 400, headers: cors });
      }
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10) {
        return NextResponse.json({ error: 'Invalid hit count' }, { status: 400, headers: cors });
      }
      seen.add(id);
      cleanHits.push({ id, count });
    }

    // 整合性: mainId があるなら hits に含まれていること
    if (mainYokaiId !== null && !seen.has(mainYokaiId)) {
      return NextResponse.json({ error: 'mainId not in hits' }, { status: 400, headers: cors });
    }
    // mainId が null なら hits は空であること(妖怪なし)
    if (mainYokaiId === null && cleanHits.length > 0) {
      return NextResponse.json({ error: 'mainId required when hits present' }, { status: 400, headers: cors });
    }

    const hitIds = cleanHits.map((h) => h.id);

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      console.error('POST /api/yokai-response admin init error:', e);
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
    }

    const { error } = await admin.from('yokai_responses').insert({
      main_yokai_id: mainYokaiId,
      hit_yokai_ids: hitIds,
      hits: cleanHits,
      total_hits: hitIds.length,
      source: typeof source === 'string' ? source.slice(0, 60) : 'yokai-diagnosis-v1',
    });

    if (error) {
      console.error('POST /api/yokai-response insert error:', error);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500, headers: cors });
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/yokai-response error:', err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500, headers: cors });
  }
}
