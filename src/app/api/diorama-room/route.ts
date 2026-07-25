import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// ステークホルダー・ジオラマのライブ配信ストア。アーティファクトの window.storage（共有KV）＋
// 3.5秒ポーリングを置き換える。フロントは /api/diorama-room に action を投げるだけ。
//   - saveRoom … ファシリテーターが盤面を配信（書き込むのは進行役だけ＝競合しない）
//   - getRoom  … 参加者が盤面を受信（ポーリングの実体）
// 書き込みは全て service_role。RLS は有効化のみ（anon拒否・service_roleバイパス）。
// テーブル定義: supabase/create_diorama_rooms.sql

export const runtime = 'nodejs';

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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const code40 = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-z0-9ぁ-ヿ一-鿿ー-]{1,40}$/.test(v) ? v : null;

// 盤面は参加者全員に見えるので、青天井では受け取らない（1部屋あたりの上限を決めておく）
const MAX_DATA_BYTES = 200_000;

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: cors });
  }
  if (!isObj(body)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: cors });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error('POST /api/diorama-room admin init error:', e);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
  }

  const action = body.action;
  const code = code40(body.code);
  if (!code) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400, headers: cors });
  }

  try {
    if (action === 'saveRoom') {
      if (!isObj(body.data)) {
        return NextResponse.json({ error: 'invalid_data' }, { status: 400, headers: cors });
      }
      if (JSON.stringify(body.data).length > MAX_DATA_BYTES) {
        return NextResponse.json({ error: 'data_too_large' }, { status: 413, headers: cors });
      }
      const { error } = await admin
        .from('diorama_rooms')
        .upsert(
          {
            code,
            data: body.data,
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'code' }
        );
      if (error) throw error;
      return NextResponse.json({ ok: true }, { status: 200, headers: cors });
    }

    if (action === 'getRoom') {
      const { data, error } = await admin
        .from('diorama_rooms')
        .select('data, updated_at')
        .eq('code', code)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json(
        { room: data ? data.data : null, updatedAt: data ? data.updated_at : null },
        { status: 200, headers: cors }
      );
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400, headers: cors });
  } catch (err) {
    console.error('POST /api/diorama-room error:', action, err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500, headers: cors });
  }
}
