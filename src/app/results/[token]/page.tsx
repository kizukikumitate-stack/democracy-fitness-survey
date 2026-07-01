import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ResultsClient from './ResultsClient';

interface Props {
  params: { token: string };
  searchParams: { edition?: string };
}

export default async function ResultsPage({ params, searchParams }: Props) {
  const { data: survey, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('token', params.token)
    .single();

  if (error || !survey) {
    notFound();
  }

  return (
    <ResultsClient
      token={params.token}
      organizationName={survey.organization_name}
      isStudent={searchParams?.edition === 'student'}
    />
  );
}
