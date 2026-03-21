import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { data: survey, error } = await supabase
      .from('surveys')
      .select('*')
      .eq('token', params.token)
      .single();

    if (error || !survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const { count } = await supabase
      .from('responses')
      .select('*', { count: 'exact', head: true })
      .eq('survey_token', params.token);

    return NextResponse.json({
      id: survey.id,
      token: survey.token,
      organizationName: survey.organization_name,
      createdAt: survey.created_at,
      responseCount: count ?? 0,
    });
  } catch (err) {
    console.error('GET /api/surveys/[token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
