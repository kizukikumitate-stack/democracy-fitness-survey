import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// イベント申込（体験会・合宿）の一覧を返す管理用エンドポイント。
// event_signups は RLS が service_role 限定のため admin client で読む。
// 個人情報（氏名・メール・電話）を含むので x-admin-key で簡易保護する。

export async function GET(req: NextRequest) {
  const adminKey = process.env.EVENTS_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: 'not_configured', message: 'EVENTS_ADMIN_KEY が未設定です（Vercel の環境変数に設定してください）' },
      { status: 503 },
    );
  }

  const provided = req.headers.get('x-admin-key') ?? '';
  if (provided !== adminKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error('GET /api/event-signups admin client init error:', e);
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  try {
    const { data, error } = await admin
      .from('event_signups')
      .select('id, created_at, name, email, event_id, event_name, attended, source, metadata')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/event-signups query error:', error);
      return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    }

    return NextResponse.json({ signups: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('GET /api/event-signups error:', err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}
