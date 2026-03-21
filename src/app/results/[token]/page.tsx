import { notFound } from 'next/navigation';
import { getSurveyByToken } from '@/lib/storage';
import ResultsClient from './ResultsClient';

interface Props {
  params: { token: string };
}

export default async function ResultsPage({ params }: Props) {
  const survey = getSurveyByToken(params.token);
  if (!survey) {
    notFound();
  }

  return <ResultsClient token={params.token} organizationName={survey.organizationName} />;
}
