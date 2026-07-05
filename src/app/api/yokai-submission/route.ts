import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// 「あなたの職場の妖怪を教えてください」投稿を1件受け取る。status=pending で貯め、
// 森本が承認したものだけが /api/yokai-gallery に出る。匿名・個人情報なし。
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }

    const { name, description, kuse } = body as {
      name?: unknown;
      description?: unknown;
      kuse?: unknown;
    };

    const cleanDesc = cleanStr(description, 500);
    if (!cleanDesc || cleanDesc.length < 4) {
      return NextResponse.json({ error: 'description required' }, { status: 400, headers: cors });
    }
    const cleanName = cleanStr(name, 40);
    const cleanKuse = cleanStr(kuse, 100);

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      console.error('POST /api/yokai-submission admin init error:', e);
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers: cors });
    }

    const { error } = await admin.from('yokai_submissions').insert({
      name: cleanName,
      description: cleanDesc,
      kuse: cleanKuse,
      status: 'pending',
      source: 'yokai-submit-v1',
    });

    if (error) {
      console.error('POST /api/yokai-submission insert error:', error);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500, headers: cors });
    }

    return NextResponse.json({ success: true }, { status: 200, headers: cors });
  } catch (err) {
    console.error('POST /api/yokai-submission error:', err);
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500, headers: cors });
  }
}
