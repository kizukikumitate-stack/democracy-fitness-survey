import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { QUESTIONS } from '@/lib/questions';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { data: survey, error: surveyError } = await supabase
      .from('surveys')
      .select('*')
      .eq('token', params.token)
      .single();

    if (surveyError || !survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const body = await req.json();
    const { respondentName, answers, surveyType } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'answers は必須です' }, { status: 400 });
    }

    const missingQuestions = QUESTIONS.filter(q => {
      const val = answers[q.id];
      return val === undefined || val === null || val < 1 || val > 5;
    });

    if (missingQuestions.length > 0) {
      return NextResponse.json(
        { error: `未回答の質問があります: ${missingQuestions.map(q => q.id).join(', ')}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('responses')
      .insert({
        survey_token: params.token,
        respondent_name: respondentName?.trim() || '匿名',
        answers: answers,
        survey_type: surveyType === 'behavior' ? 'behavior' : 'attitude',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id }, { status: 201 });
  } catch (err) {
    console.error('POST /api/responses/[token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { data: survey, error: surveyError } = await supabase
      .from('surveys')
      .select('*')
      .eq('token', params.token)
      .single();

    if (surveyError || !survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const type = req.nextUrl.searchParams.get('type');

    const { data: allResponses, error } = await supabase
      .from('responses')
      .select('*')
      .eq('survey_token', params.token)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const responses = (allResponses || []).filter(r => {
      if (type === 'behavior') return r.survey_type === 'behavior';
      if (type === 'attitude') return !r.survey_type || r.survey_type === 'attitude';
      return true;
    });

    return NextResponse.json(responses);
  } catch (err) {
    console.error('GET /api/responses/[token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
