import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { QUESTIONS } from '@/lib/questions';
import { sendResultEmail } from '@/lib/sendResultEmail';

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
    const { respondentName, respondentEmail, answers, surveyType } = body;

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

    const name = respondentName?.trim() || '匿名';
    const email = typeof respondentEmail === 'string' ? respondentEmail.trim() : '';

    // まず全列込みで INSERT を試みる
    let { data, error } = await supabase
      .from('responses')
      .insert({
        survey_token: params.token,
        respondent_name: name,
        respondent_email: email || null,
        answers: answers,
        survey_type: surveyType === 'behavior' ? 'behavior' : 'attitude',
      })
      .select()
      .single();

    // 列が存在しない場合（マイグレーション未実施）は最小限で再試行
    if (error && (error.message?.includes('survey_type') || error.message?.includes('respondent_email'))) {
      const retry = await supabase
        .from('responses')
        .insert({
          survey_token: params.token,
          respondent_name: name,
          answers: answers,
        })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    // メールアドレスが入力されていれば結果メールを非同期送信
    if (email) {
      sendResultEmail({
        to: email,
        organizationName: survey.organization_name,
        respondentName: name,
        answers,
      }).catch(e => console.error('sendResultEmail failed (non-fatal):', e));
    }

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
