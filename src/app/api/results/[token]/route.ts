import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { QUESTIONS, MUSCLES, transformScore } from '@/lib/questions';

export async function GET(
  _req: NextRequest,
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

    const { data: responses, error: responsesError } = await supabase
      .from('responses')
      .select('*')
      .eq('survey_token', params.token);

    if (responsesError) throw responsesError;

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

      const individualScores = responses.map(response => {
        const questionScores = layer1Questions.map(q => {
          const raw = response.answers[q.id] ?? 3;
          return transformScore(raw, q.reversed);
        });
        return questionScores.reduce((sum, s) => sum + s, 0) / questionScores.length;
      });
      const individual = individualScores.reduce((sum, s) => sum + s, 0) / individualScores.length;

      const organizationScores = responses.map(response => {
        const questionScores = layer2Questions.map(q => {
          const raw = response.answers[q.id] ?? 3;
          return transformScore(raw, q.reversed);
        });
        return questionScores.reduce((sum, s) => sum + s, 0) / questionScores.length;
      });
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
