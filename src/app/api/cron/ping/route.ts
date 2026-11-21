import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = getServerSupabase();
    const { error } = await supabase.from('surveys').select('id').limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Cron ping error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
