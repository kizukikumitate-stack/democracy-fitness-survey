import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { QUESTIONS, MUSCLES, transformScore } from '@/lib/questions';

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

    const { data: allResponses, error: responsesError } = await supabase
      .from('responses')
      .select('*')
      .eq('survey_token', params.token);

    if (responsesError) throw responsesError;

    const responses = (allResponses || []).filter(r => {
      if (type === 'behavior') return r.survey_type === 'behavior';
      if (type === 'attitude') return !r.survey_type || r.survey_type === 'attitude';
      return true;
    });

    const responseCount = responses?.length ?? 0;

    if (responseCount === 0) {
      return NextResponse.json({
        organizationName: survey.organization_name,
        responseCount: 0,
        scores: MUSCLES.map(m => ({
          muscleIndex: m.index,
          muscleName: m.name,
          individual: 0,
          organization: 0,
        })),
      });
    }

    const scores = MUSCLES.map(muscle => {
      const layer1Questions = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 1);
      const layer2Questions = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 2);

      // 学生版(40問)は各筋のIDの一部のみ回答されるため、回答が存在する設問だけで平均する
      // （60問版は全設問回答済みなので結果は変わらない）
      const layerAvg = (answers: Record<string, number>, qs: typeof layer1Questions) => {
        const present = qs.filter(q => answers[q.id] != null);
        const base = present.length > 0 ? present : qs;
        return base.map(q => transformScore(answers[q.id] ?? 3, q.reversed)).reduce((s, v) => s + v, 0) / base.length;
      };

      const individualScores = responses.map(response => layerAvg(response.answers, layer1Questions));
      const individual = individualScores.reduce((sum, s) => sum + s, 0) / individualScores.length;

      const organizationScores = responses.map(response => layerAvg(response.answers, layer2Questions));
      const organization = organizationScores.reduce((sum, s) => sum + s, 0) / organizationScores.length;

      return {
        muscleIndex: muscle.index,
        muscleName: muscle.name,
        individual,
        organization,
      };
    });

    return NextResponse.json({
      organizationName: survey.organization_name,
      responseCount,
      scores,
    });
  } catch (err) {
    console.error('GET /api/results/[token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
