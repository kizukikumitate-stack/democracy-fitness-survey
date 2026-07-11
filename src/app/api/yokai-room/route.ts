import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// 妖怪と式神ワークショップの共有状態ストア。アーティファクトの window.storage（共有KV）＋
// 3.5秒ポーリングを置き換える。フロントは /api/yokai-room に action を投げるだけ。
//   - createRoom / getRoom / saveRoom      … 部屋（複数人版。書き込みは進行役のみ＝競合しない）
//   - saveParticipant / sync               … 参加者と同期取得（sync がポーリングの実体）
//   - postEma / listEmas / react           … 絵馬（ソロ版は room_code=null の公開ボード）
// 書き込みは全て service_role。RLS は有効化のみ（anon拒否・service_roleバイパス）。
// テーブル定義: supabase/create_yokai_workshop.sql

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
  typeof v === 'string' && /^[a-z0-9぀-ヿ一-鿿-]{1,40}$/.test(v) ? v : null;
const str = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');

type Admin = ReturnType<typeof createSupabaseAdminClient>;

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

  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error('POST /api/yokai-room admin init error:', e);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
  }

  const action = body.action;

  try {
    // ---------- 部屋 ----------
    if (action === 'createRoom' || action === 'saveRoom') {
      const code = code40(body.code);
      if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400, headers: cors });
      if (!isObj(body.data))
        return NextResponse.json({ error: 'invalid_data' }, { status: 400, headers: cors });
      const { error } = await admin
        .from('yokai_rooms')
        .upsert({ code, data: body.data, updated_at: new Date().toISOString() }, { onConflict: 'code' });
      if (error) throw error;
      return NextResponse.json({ ok: true }, { status: 200, headers: cors });
    }

    if (action === 'getRoom') {
      const code = code40(body.code);
      if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400, headers: cors });
      const { data, error } = await admin.from('yokai_rooms').select('data').eq('code', code).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ room: data ? data.data : null }, { status: 200, headers: cors });
    }

    // ---------- 参加者 ----------
    if (action === 'saveParticipant') {
      const code = code40(body.code);
      const pid = str(body.pid, 40);
      if (!code || !pid)
        return NextResponse.json({ error: 'invalid_ids' }, { status: 400, headers: cors });
      if (!isObj(body.data))
        return NextResponse.json({ error: 'invalid_data' }, { status: 400, headers: cors });
      const { error } = await admin.from('yokai_participants').upsert(
        { room_code: code, pid, data: body.data, updated_at: new Date().toISOString() },
        { onConflict: 'room_code,pid' }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true }, { status: 200, headers: cors });
    }

    // ---------- 同期（ポーリングの実体） ----------
    if (action === 'sync') {
      const code = code40(body.code);
      if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400, headers: cors });
      const [roomRes, partRes] = await Promise.all([
        admin.from('yokai_rooms').select('data').eq('code', code).maybeSingle(),
        admin
          .from('yokai_participants')
          .select('pid, data')
          .eq('room_code', code)
          .order('updated_at', { ascending: true })
          .limit(30),
      ]);
      if (roomRes.error) throw roomRes.error;
      if (partRes.error) throw partRes.error;
      const participants = (partRes.data || []).map((p) => ({
        pid: p.pid,
        ...(isObj(p.data) ? p.data : {}),
      }));
      return NextResponse.json(
        { room: roomRes.data ? roomRes.data.data : null, participants },
        { status: 200, headers: cors }
      );
    }

    // ---------- 絵馬 ----------
    if (action === 'postEma') {
      const ema = body.ema;
      if (!isObj(ema)) return NextResponse.json({ error: 'invalid_ema' }, { status: 400, headers: cors });
      const id = str(ema.id, 80);
      const yokai = str(ema.yokai, 200);
      if (!id || !yokai)
        return NextResponse.json({ error: 'invalid_ema_fields' }, { status: 400, headers: cors });
      const roomCode = body.room_code === null || body.room_code === undefined ? null : code40(body.room_code);
      if (body.room_code && !roomCode)
        return NextResponse.json({ error: 'invalid_room_code' }, { status: 400, headers: cors });
      const verbs = Array.isArray(ema.verbs)
        ? (ema.verbs as unknown[]).filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 40)).slice(0, 10)
        : [];
      const { error } = await admin.from('yokai_emas').insert({
        id,
        room_code: roomCode,
        yokai,
        by_name: str(ema.by, 60) || str(ema.by_name, 60) || null,
        taiji_type: str(ema.type, 40) || str(ema.taiji_type, 40) || null,
        card: str(ema.card, 60) || null,
        verbs,
        practice: str(ema.practice, 400) || null,
        message: str(ema.message, 400) || null,
        ema_date: str(ema.date, 20) || str(ema.ema_date, 20) || null,
        reactions: 0,
      });
      if (error) {
        // 同一IDの二重奉納（ユニーク制約）は成功扱いにする（冪等）
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ ok: true, duplicate: true }, { status: 200, headers: cors });
        }
        throw error;
      }
      return NextResponse.json({ ok: true }, { status: 200, headers: cors });
    }

    if (action === 'listEmas') {
      const roomCode =
        body.room_code === null || body.room_code === undefined ? null : code40(body.room_code);
      if (body.room_code && !roomCode)
        return NextResponse.json({ error: 'invalid_room_code' }, { status: 400, headers: cors });
      let q = admin
        .from('yokai_emas')
        .select('id, yokai, by_name, taiji_type, card, verbs, practice, message, ema_date, reactions')
        .order('created_at', { ascending: false })
        .limit(50);
      q = roomCode ? q.eq('room_code', roomCode) : q.is('room_code', null);
      const { data, error } = await q;
      if (error) throw error;
      const emas = (data || []).map((e) => ({
        id: e.id,
        yokai: e.yokai,
        by: e.by_name,
        type: e.taiji_type,
        card: e.card,
        verbs: e.verbs || [],
        practice: e.practice,
        message: e.message,
        date: e.ema_date,
        reactions: e.reactions,
      }));
      return NextResponse.json({ emas }, { status: 200, headers: cors });
    }

    if (action === 'react') {
      const id = str(body.id, 80);
      if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400, headers: cors });
      const { data, error } = await admin.rpc('increment_yokai_reaction', { p_id: id });
      if (error) throw error;
      return NextResponse.json({ reactions: typeof data === 'number' ? data : null }, { status: 200, headers: cors });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400, headers: cors });
  } catch (err) {
    console.error('POST /api/yokai-room error:', action, err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500, headers: cors });
  }
}
