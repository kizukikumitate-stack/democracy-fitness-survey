import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: surveys, error } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get response counts for each survey
    const surveysWithCount = await Promise.all(
      (surveys || []).map(async (s) => {
        const { count } = await supabase
          .from('responses')
          .select('*', { count: 'exact', head: true })
          .eq('survey_token', s.token);
        return {
          id: s.id,
          token: s.token,
          organizationName: s.organization_name,
          createdAt: s.created_at,
          responseCount: count ?? 0,
        };
      })
    );

    return NextResponse.json(surveysWithCount);
  } catch (err) {
    console.error('GET /api/surveys error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { organizationName } = body;

    if (!organizationName || typeof organizationName !== 'string' || organizationName.trim() === '') {
      return NextResponse.json({ error: '組織名は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('surveys')
      .insert({ organization_name: organizationName.trim() })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      token: data.token,
      organizationName: data.organization_name,
      createdAt: data.created_at,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/surveys error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
