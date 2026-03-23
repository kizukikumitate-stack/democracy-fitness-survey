import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { organizationName } = await req.json();
    if (!organizationName?.trim()) {
      return NextResponse.json({ error: '組織名を入力してください' }, { status: 400 });
    }
    const { error } = await supabase
      .from('surveys')
      .update({ organization_name: organizationName.trim() })
      .eq('token', params.token);
    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/surveys/[token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
