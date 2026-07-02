import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { QUESTIONS, MUSCLES, transformScore, getQuestionSet } from '@/lib/questions';
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
    const { respondentName, respondentEmail, answers, surveyType, edition } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'answers は必須です' }, { status: 400 });
    }

    const questionSet = getQuestionSet(edition === 'student' ? 'student' : 'business');
    const missingQuestions = questionSet.filter(q => {
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

    // メールアドレスが入力されていれば結果メールを送信（レスポンス前に完了させる）
    if (email) {
      try {
        // 全回答を取得して全体平均スコアを計算
        const { data: allResponses } = await supabase
          .from('responses')
          .select('answers')
          .eq('survey_token', params.token);

        let avgScores = null;
        if (allResponses && allResponses.length > 1) {
          avgScores = MUSCLES.map(muscle => {
            const l1 = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 1);
            const l2 = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 2);
            // 学生版(40問)は各筋のIDの一部のみ回答されるため、回答が存在する設問だけで平均する
            // （60問版は全設問回答済みなので結果は変わらない）
            const layerAvg = (answers: Record<string, number>, qs: typeof l1) => {
              const present = qs.filter(q => answers[q.id] != null);
              const base = present.length > 0 ? present : qs;
              return base.map(q => transformScore(answers[q.id] ?? 3, q.reversed)).reduce((s, v) => s + v, 0) / base.length;
            };
            const indVals = allResponses.map(r => layerAvg(r.answers, l1));
            const orgVals = allResponses.map(r => layerAvg(r.answers, l2));
            return {
              muscleIndex: muscle.index,
              muscleName: muscle.name,
              individual: indVals.reduce((s, v) => s + v, 0) / indVals.length,
              organization: orgVals.reduce((s, v) => s + v, 0) / orgVals.length,
            };
          });
        }

        await sendResultEmail({
          to: email,
          organizationName: survey.organization_name,
          respondentName: name,
          answers,
          avgScores,
        });
      } catch (e) {
        console.error('sendResultEmail failed (non-fatal):', e);
      }
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
