'use client';

import { useState, useEffect } from 'react';
import Logo from '@/components/Logo';
import SurveyRadarChart from '@/components/SurveyRadarChart';
import QuadrantMatrix from '@/components/QuadrantMatrix';
import { MUSCLES, QUESTIONS, transformScore } from '@/lib/questions';

interface MuscleScore {
  muscleIndex: number;
  muscleName: string;
  individual: number;
  organization: number;
}

interface ResultsData {
  organizationName: string;
  responseCount: number;
  scores: MuscleScore[];
}

interface RawResponse {
  id: string;
  survey_token: string;
  respondent_name: string | null;
  answers: Record<string, number>;
  survey_type: string | null;
  created_at: string;
}

interface IndividualResult {
  id: string;
  name: string;
  createdAt: string;
  surveyType: string;
  scores: MuscleScore[];
}

interface Props {
  token: string;
  organizationName: string;
}

type SurveyTypeFilter = 'all' | 'attitude' | 'behavior';

const QUADRANT_COLORS = {
  both_high: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700' },
  individual_low: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
  org_low: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  both_low: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
};

function getQuadrant(individual: number, organization: number) {
  const mid = 3;
  if (individual >= mid && organization >= mid) return 'both_high';
  if (individual >= mid && organization < mid) return 'org_low';
  if (individual < mid && organization >= mid) return 'individual_low';
  return 'both_low';
}

function getQuadrantLabel(q: string) {
  switch (q) {
    case 'both_high': return '発揮できている';
    case 'individual_low': return '個人が課題';
    case 'org_low': return '環境が阻害中';
    case 'both_low': return '両方に課題';
    default: return '';
  }
}

function computeScores(answers: Record<string, number>): MuscleScore[] {
  return MUSCLES.map(muscle => {
    const layer1Questions = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 1);
    const layer2Questions = QUESTIONS.filter(q => q.muscleIndex === muscle.index && q.layer === 2);

    const individualScores = layer1Questions.map(q => transformScore(answers[q.id] ?? 3, q.reversed));
    const individual = individualScores.reduce((sum, s) => sum + s, 0) / individualScores.length;

    const orgScores = layer2Questions.map(q => transformScore(answers[q.id] ?? 3, q.reversed));
    const organization = orgScores.reduce((sum, s) => sum + s, 0) / orgScores.length;

    return { muscleIndex: muscle.index, muscleName: muscle.name, individual, organization };
  });
}

function DiffBadge({ diff }: { diff: number }) {
  const sign = diff >= 0 ? '+' : '';
  const color = diff >= 0.1 ? 'text-green-600' : diff <= -0.1 ? 'text-red-500' : 'text-slate-400';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {sign}{diff.toFixed(2)}
    </span>
  );
}

function ScoreTable({ scores, avgScores }: { scores: MuscleScore[]; avgScores?: MuscleScore[] }) {
  const avgMap = avgScores ? new Map(avgScores.map(s => [s.muscleIndex, s])) : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">筋肉</th>
            <th className="text-center px-4 py-3 text-xs font-medium text-blue-600 uppercase tracking-wider">
              {avgMap ? '個人（本人 / 平均）' : '個人'}
            </th>
            <th className="text-center px-4 py-3 text-xs font-medium text-green-600 uppercase tracking-wider">
              {avgMap ? '組織（本人 / 平均）' : '組織'}
            </th>
            <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">診断</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {scores.map(score => {
            const quadrant = getQuadrant(score.individual, score.organization);
            const qColors = QUADRANT_COLORS[quadrant];
            const avg = avgMap?.get(score.muscleIndex);
            return (
              <tr key={score.muscleIndex} className="hover:bg-slate-50 transition">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800 text-sm">{MUSCLES[score.muscleIndex].name}</div>
                  <div className="text-xs text-slate-400">{MUSCLES[score.muscleIndex].nameEn}</div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(score.individual / 5) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-blue-600 w-8 text-right">{score.individual.toFixed(2)}</span>
                  </div>
                  {avg && (
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <span className="text-xs text-slate-400">平均 {avg.individual.toFixed(2)}</span>
                      <DiffBadge diff={score.individual - avg.individual} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${(score.organization / 5) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-green-600 w-8 text-right">{score.organization.toFixed(2)}</span>
                  </div>
                  {avg && (
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <span className="text-xs text-slate-400">平均 {avg.organization.toFixed(2)}</span>
                      <DiffBadge diff={score.organization - avg.organization} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${qColors.badge}`}>
                    {getQuadrantLabel(quadrant)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SURVEY_TYPE_LABELS: Record<SurveyTypeFilter, string> = {
  all: '全体',
  attitude: '意識調査',
  behavior: '行動実績',
};

export default function ResultsClient({ token, organizationName }: Props) {
  const [results, setResults] = useState<ResultsData | null>(null);
  const [individuals, setIndividuals] = useState<IndividualResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'org' | 'individual'>('org');
  const [openId, setOpenId] = useState<string | null>(null);
  const [blurNames, setBlurNames] = useState(false);
  const [surveyTypeFilter, setSurveyTypeFilter] = useState<SurveyTypeFilter>('all');

  useEffect(() => {
    setLoading(true);
    setOpenId(null);
    const fetchAll = async () => {
      try {
        const typeParam = surveyTypeFilter !== 'all' ? `?type=${surveyTypeFilter}` : '';
        const [resOrg, resRaw] = await Promise.all([
          fetch(`/api/results/${token}${typeParam}`),
          fetch(`/api/responses/${token}${typeParam}`),
        ]);
        if (resOrg.ok) {
          setResults(await resOrg.json());
        } else {
          setError('結果の取得に失敗しました');
        }
        if (resRaw.ok) {
          const raw: RawResponse[] = await resRaw.json();
          setIndividuals(
            raw.map(r => ({
              id: r.id,
              name: r.respondent_name || '匿名',
              createdAt: r.created_at,
              surveyType: r.survey_type || 'attitude',
              scores: computeScores(r.answers),
            }))
          );
        }
      } catch {
        setError('通信エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [token, surveyTypeFilter]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <h1 className="text-xl font-bold text-red-600 mb-2">エラー</h1>
        <p className="text-slate-500 text-sm">{error || '結果が取得できませんでした'}</p>
      </div>
    );
  }

  const radarData = results.scores.map(s => ({
    muscle: MUSCLES[s.muscleIndex].name,
    individual: Math.round(s.individual * 100) / 100,
    organization: Math.round(s.organization * 100) / 100,
  }));

  const matrixData = results.scores.map(s => ({
    name: MUSCLES[s.muscleIndex].name,
    individual: Math.round(s.individual * 100) / 100,
    organization: Math.round(s.organization * 100) / 100,
  }));

  const quadrantGroups = {
    both_high: results.scores.filter(s => getQuadrant(s.individual, s.organization) === 'both_high'),
    org_low: results.scores.filter(s => getQuadrant(s.individual, s.organization) === 'org_low'),
    individual_low: results.scores.filter(s => getQuadrant(s.individual, s.organization) === 'individual_low'),
    both_low: results.scores.filter(s => getQuadrant(s.individual, s.organization) === 'both_low'),
  };

  const avgIndividual = results.scores.reduce((sum, s) => sum + s.individual, 0) / results.scores.length;
  const avgOrganization = results.scores.reduce((sum, s) => sum + s.organization, 0) / results.scores.length;

  // Average radar data used for individual comparison overlay
  const avgRadar = results.scores.map(s => ({
    muscle: MUSCLES[s.muscleIndex].name,
    individual: Math.round(s.individual * 100) / 100,
    organization: Math.round(s.organization * 100) / 100,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo size="md" showSubtitle />
          <a href="/" className="text-sm text-slate-500 hover:text-slate-700 transition">管理画面へ</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">{organizationName}</h1>
          <p className="text-slate-500 text-sm">デモクラシーフィットネス診断 結果レポート</p>
        </div>

        {/* Survey type filter */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-slate-500 font-medium">診断種別：</span>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['all', 'attitude', 'behavior'] as const).map(type => (
              <button
                key={type}
                onClick={() => setSurveyTypeFilter(type)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  surveyTypeFilter === type
                    ? type === 'behavior'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : type === 'attitude'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {SURVEY_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          {surveyTypeFilter !== 'all' && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              surveyTypeFilter === 'behavior'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {SURVEY_TYPE_LABELS[surveyTypeFilter]}のみ表示中
            </span>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{results.responseCount}</div>
            <div className="text-xs text-slate-500 mt-1">回答者数</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{avgIndividual.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-1">個人スコア平均</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{avgOrganization.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-1">組織スコア平均</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-3xl font-bold text-slate-600">10</div>
            <div className="text-xs text-slate-500 mt-1">診断筋肉数</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
          <button
            onClick={() => setTab('org')}
            className={`px-5 py-2 rounded-md text-sm font-medium transition ${
              tab === 'org' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            組織全体
          </button>
          <button
            onClick={() => setTab('individual')}
            className={`px-5 py-2 rounded-md text-sm font-medium transition ${
              tab === 'individual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            個人別
            <span className="ml-1.5 text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
              {individuals.length}
            </span>
          </button>
        </div>

        {/* ===== 組織全体タブ ===== */}
        {tab === 'org' && (
          <>
            {results.responseCount === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500">
                  {surveyTypeFilter === 'all' ? 'まだ回答がありません。' : `${SURVEY_TYPE_LABELS[surveyTypeFilter]}の回答がありません。`}
                </p>
                <p className="text-slate-400 text-sm mt-2">サーベイリンクを共有して回答を集めてください。</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
                  <h2 className="text-lg font-semibold text-slate-800 mb-1">レーダーチャート</h2>
                  <p className="text-sm text-slate-500 mb-4">10筋肉の個人平均（青）と組織平均（緑）</p>
                  <SurveyRadarChart data={radarData} />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
                  <h2 className="text-lg font-semibold text-slate-800 mb-1">4象限マトリクス</h2>
                  <p className="text-sm text-slate-500 mb-4">横軸=個人スコア、縦軸=組織スコア（中心=3.0）</p>
                  <QuadrantMatrix data={matrixData} />
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="font-semibold text-green-800 text-sm mb-1">右上：発揮できている</div>
                      <p className="text-green-700 text-xs">個人の力が高く、組織環境も整っている</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {quadrantGroups.both_high.map(s => (
                          <span key={s.muscleIndex} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{MUSCLES[s.muscleIndex].name}</span>
                        ))}
                        {quadrantGroups.both_high.length === 0 && <span className="text-xs text-green-600">-</span>}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="font-semibold text-blue-800 text-sm mb-1">右下：環境が阻害中</div>
                      <p className="text-blue-700 text-xs">個人の力はあるが、組織環境が整っていない</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {quadrantGroups.org_low.map(s => (
                          <span key={s.muscleIndex} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{MUSCLES[s.muscleIndex].name}</span>
                        ))}
                        {quadrantGroups.org_low.length === 0 && <span className="text-xs text-blue-600">-</span>}
                      </div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <div className="font-semibold text-orange-800 text-sm mb-1">左上：個人が課題</div>
                      <p className="text-orange-700 text-xs">組織環境は整っているが、個人の力が課題</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {quadrantGroups.individual_low.map(s => (
                          <span key={s.muscleIndex} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{MUSCLES[s.muscleIndex].name}</span>
                        ))}
                        {quadrantGroups.individual_low.length === 0 && <span className="text-xs text-orange-600">-</span>}
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="font-semibold text-red-800 text-sm mb-1">左下：両方に課題</div>
                      <p className="text-red-700 text-xs">個人・組織の両方で強化が必要</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {quadrantGroups.both_low.map(s => (
                          <span key={s.muscleIndex} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{MUSCLES[s.muscleIndex].name}</span>
                        ))}
                        {quadrantGroups.both_low.length === 0 && <span className="text-xs text-red-600">-</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-semibold text-slate-800">筋肉別スコア一覧</h2>
                  </div>
                  <ScoreTable scores={results.scores} />
                </div>
              </>
            )}
          </>
        )}

        {/* ===== 個人別タブ ===== */}
        {tab === 'individual' && (
          <>
            {individuals.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500">
                  {surveyTypeFilter === 'all' ? 'まだ回答がありません。' : `${SURVEY_TYPE_LABELS[surveyTypeFilter]}の回答がありません。`}
                </p>
              </div>
            ) : (
              <>
                {results.responseCount > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-slate-500">
                      各個人を開くと、スコアが
                      <span className="font-medium text-slate-700">全体平均（オレンジ点線）</span>
                      と比較して表示されます。スコア表の差分（+/-）は全体平均との差です。
                    </p>
                  </div>
                )}
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => setBlurNames(v => !v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    blurNames
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {blurNames ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                  {blurNames ? '名前を表示' : '名前を隠す'}
                </button>
              </div>
              <div className="space-y-4">
                {individuals.map((person) => {
                  const isOpen = openId === person.id;
                  const avgInd = person.scores.reduce((s, sc) => s + sc.individual, 0) / person.scores.length;
                  const avgOrg = person.scores.reduce((s, sc) => s + sc.organization, 0) / person.scores.length;
                  const personRadar = person.scores.map(s => ({
                    muscle: MUSCLES[s.muscleIndex].name,
                    individual: Math.round(s.individual * 100) / 100,
                    organization: Math.round(s.organization * 100) / 100,
                  }));

                  const indDiffFromAvg = avgInd - avgIndividual;
                  const orgDiffFromAvg = avgOrg - avgOrganization;

                  return (
                    <div key={person.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      {/* Header row */}
                      <button
                        onClick={() => setOpenId(isOpen ? null : person.id)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0 transition-all ${blurNames && !isOpen ? 'blur-sm select-none' : ''}`}>
                            {person.name.charAt(0)}
                          </div>
                          <div>
                            <div className={`font-semibold text-slate-800 transition-all ${blurNames && !isOpen ? 'blur-sm select-none' : ''}`}>{person.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-400">{formatDate(person.createdAt)}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                person.surveyType === 'behavior'
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-blue-100 text-blue-600'
                              }`}>
                                {person.surveyType === 'behavior' ? '行動実績' : '意識調査'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="hidden sm:flex gap-6 text-sm">
                            <span>個人 <span className="font-bold text-blue-600">{avgInd.toFixed(2)}</span></span>
                            <span>組織 <span className="font-bold text-green-600">{avgOrg.toFixed(2)}</span></span>
                          </div>
                          <svg
                            className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="border-t border-slate-100 px-6 py-6">
                          {/* Score summary: self vs avg */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            <div className="bg-blue-50 rounded-lg p-3 text-center">
                              <div className="text-2xl font-bold text-blue-600">{avgInd.toFixed(2)}</div>
                              <div className="text-xs text-slate-500 mt-0.5">個人スコア（本人）</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-center">
                              <div className="text-2xl font-bold text-slate-500">{avgIndividual.toFixed(2)}</div>
                              <div className="text-xs text-slate-500 mt-0.5">個人スコア（全体平均）</div>
                              <div className="mt-1"><DiffBadge diff={indDiffFromAvg} /></div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                              <div className="text-2xl font-bold text-green-600">{avgOrg.toFixed(2)}</div>
                              <div className="text-xs text-slate-500 mt-0.5">組織スコア（本人）</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-center">
                              <div className="text-2xl font-bold text-slate-500">{avgOrganization.toFixed(2)}</div>
                              <div className="text-xs text-slate-500 mt-0.5">組織スコア（全体平均）</div>
                              <div className="mt-1"><DiffBadge diff={orgDiffFromAvg} /></div>
                            </div>
                          </div>

                          <div className="mb-6">
                            <h3 className="text-sm font-semibold text-slate-700 mb-1">レーダーチャート</h3>
                            <p className="text-xs text-slate-400 mb-3">実線=本人スコア、点線=全体平均</p>
                            <SurveyRadarChart data={personRadar} avgData={results.responseCount > 1 ? avgRadar : undefined} />
                          </div>

                          <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-3">筋肉別スコア</h3>
                            <div className="rounded-lg border border-slate-100 overflow-hidden">
                              <ScoreTable scores={person.scores} avgScores={results.responseCount > 1 ? results.scores : undefined} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </>
        )}

        <div className="text-center py-6 border-t border-slate-200 mt-8">
          <Logo size="sm" showSubtitle />
        </div>
      </main>
    </div>
  );
}
