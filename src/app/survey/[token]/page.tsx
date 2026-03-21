'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Logo from '@/components/Logo';
import { LAYER1_QUESTIONS, LAYER2_QUESTIONS, MUSCLES, Question, BEHAVIORAL_QUESTION_TEXTS } from '@/lib/questions';

type Answers = Record<string, number>;

type PageState = 'loading' | 'not_found' | 'part1' | 'part2' | 'submitting' | 'done' | 'error';

const SCORE_LABELS_ATTITUDE = ['', '全くそう思わない', 'そう思わない', 'どちらともいえない', 'そう思う', '強くそう思う'];
const SCORE_LABELS_BEHAVIOR = ['', '全くなかった', 'ほぼなかった', '時々あった', 'よくあった', '常にあった'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function QuestionCard({ question, value, onChange, index, blind, behavior }: {
  question: Question;
  value: number | undefined;
  onChange: (id: string, score: number) => void;
  index: number;
  blind: boolean;
  behavior: boolean;
}) {
  const SCORE_LABELS = behavior ? SCORE_LABELS_BEHAVIOR : SCORE_LABELS_ATTITUDE;
  const questionText = behavior ? (BEHAVIORAL_QUESTION_TEXTS[question.id] ?? question.text) : question.text;
  const muscle = MUSCLES[question.muscleIndex];
  const muscleColors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-red-100 text-red-700',
    'bg-yellow-100 text-yellow-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
    'bg-lime-100 text-lime-700',
    'bg-orange-100 text-orange-700',
    'bg-indigo-100 text-indigo-700',
  ];
  const colorClass = muscleColors[question.muscleIndex % muscleColors.length];

  return (
    <div className={`bg-white rounded-xl border ${value !== undefined ? 'border-green-200' : 'border-slate-200'} p-5 transition`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="flex-shrink-0 w-7 h-7 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-semibold">
          {index + 1}
        </span>
        <div className="flex-1">
          {!blind && (
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-2 ${colorClass}`}>
              {muscle.name}
            </span>
          )}
          <p className="text-slate-800 text-sm sm:text-base leading-relaxed">
            {questionText}
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap justify-center sm:justify-start mt-3">
        {[1, 2, 3, 4, 5].map(score => (
          <label key={score} className="cursor-pointer">
            <input
              type="radio"
              name={question.id}
              value={score}
              checked={value === score}
              onChange={() => onChange(question.id, score)}
              className="sr-only"
            />
            <div className={`
              w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 flex flex-col items-center justify-center transition
              ${value === score
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50'
              }
            `}>
              <span className="text-lg font-bold leading-none">{score}</span>
            </div>
            <p className="text-xs text-center text-slate-400 mt-1 w-12 sm:w-14 leading-tight hidden sm:block">
              {score === 1 ? SCORE_LABELS[1] : score === 3 ? (behavior ? '時々あった' : 'どちらとも') : score === 5 ? SCORE_LABELS[5] : ''}
            </p>
          </label>
        ))}
      </div>

      {value !== undefined && (
        <p className="text-xs text-blue-600 mt-2 sm:hidden">
          選択: {SCORE_LABELS[value]}
        </p>
      )}
    </div>
  );
}

// Group questions by muscle (used in normal mode)
function groupByMuscle(questions: Question[]) {
  const groups: { muscle: typeof MUSCLES[0]; questions: Question[] }[] = [];
  MUSCLES.forEach(muscle => {
    const qs = questions.filter(q => q.muscleIndex === muscle.index);
    if (qs.length > 0) {
      groups.push({ muscle, questions: qs });
    }
  });
  return groups;
}

export default function SurveyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const blind = searchParams.get('blind') === '1';
  const behavior = searchParams.get('behavior') === '1';

  const [pageState, setPageState] = useState<PageState>('loading');
  const [organizationName, setOrganizationName] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [respondentDate, setRespondentDate] = useState('');
  const [answers, setAnswers] = useState<Answers>({});

  // Shuffle questions every session (both normal and blind mode)
  const shuffledPart1 = useMemo(() => shuffle(LAYER1_QUESTIONS), []);
  const shuffledPart2 = useMemo(() => shuffle(LAYER2_QUESTIONS), []);

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const res = await fetch(`/api/surveys/${token}`);
        if (res.ok) {
          const data = await res.json();
          setOrganizationName(data.organizationName);
          setPageState('part1');
        } else {
          setPageState('not_found');
        }
      } catch {
        setPageState('error');
      }
    };
    fetchSurvey();
  }, [token]);

  const handleAnswer = (id: string, score: number) => {
    setAnswers(prev => ({ ...prev, [id]: score }));
  };

  const part1Answered = LAYER1_QUESTIONS.every(q => answers[q.id] !== undefined);
  const part2Answered = LAYER2_QUESTIONS.every(q => answers[q.id] !== undefined);

  const part1AnsweredCount = LAYER1_QUESTIONS.filter(q => answers[q.id] !== undefined).length;
  const part2AnsweredCount = LAYER2_QUESTIONS.filter(q => answers[q.id] !== undefined).length;

  const handleSubmit = async () => {
    setPageState('submitting');
    try {
      const res = await fetch(`/api/responses/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          respondentName: respondentName.trim() || '匿名',
          respondentDate: respondentDate || '',
          answers,
        }),
      });
      if (res.ok) {
        setPageState('done');
      } else {
        setPageState('error');
      }
    } catch {
      setPageState('error');
    }
  };

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="text-6xl mb-4">404</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">サーベイが見つかりません</h1>
        <p className="text-slate-500 text-sm">URLが正しいか確認してください。</p>
      </div>
    );
  }

  if (pageState === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-3">回答ありがとうございました！</h1>
          <p className="text-slate-500 mb-2">
            <span className="font-medium text-slate-700">{organizationName}</span> のサーベイへの回答が完了しました。
          </p>
          <p className="text-slate-400 text-sm">
            あなたの回答は組織の対話力診断に活用されます。
          </p>
          <div className="mt-6 pt-6 border-t border-slate-100">
            <Logo size="sm" showSubtitle />
          </div>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">エラーが発生しました</h1>
          <p className="text-slate-500 text-sm mb-4">もう一度お試しください。</p>
          <button
            onClick={() => setPageState('part1')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  const isPartOne = pageState === 'part1';
  const currentQuestions = isPartOne ? shuffledPart1 : shuffledPart2;
  const currentAnsweredCount = isPartOne ? part1AnsweredCount : part2AnsweredCount;
  const totalQuestions = currentQuestions.length;
  const progressPct = Math.round((currentAnsweredCount / totalQuestions) * 100);
  const groups = groupByMuscle(currentQuestions);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <Logo size="sm" />
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">{organizationName}</p>
              <p className="text-xs text-slate-400">
                {isPartOne ? 'Part 1: 個人評価' : 'Part 2: 組織評価'}
              </p>
            </div>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {currentAnsweredCount}/{totalQuestions}
            </span>
          </div>
          {/* Part indicator */}
          <div className="flex gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPartOne ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              Part 1 個人評価
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${!isPartOne ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              Part 2 組織評価
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Intro message (only on part1) */}
        {isPartOne && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex gap-3">
              <span className="text-2xl flex-shrink-0">💪</span>
              <div>
                <p className="text-sm text-amber-800 leading-relaxed">
                  このサーベイは、ダイエットと同じく、<span className="font-semibold">現在の状態を把握し、改善していくため</span>のものです。
                </p>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                  できるだけバイアスが生まれないよう、深く考えすぎず<span className="font-semibold">直感を大切に</span>回答してください。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Part description */}
        <div className={`rounded-xl p-5 mb-6 border ${isPartOne ? 'bg-blue-50 border-blue-100' : 'bg-green-50 border-green-100'}`}>
          <h1 className={`text-lg font-bold mb-1 ${isPartOne ? 'text-blue-800' : 'text-green-800'}`}>
            {isPartOne ? 'Part 1: 個人評価（30問）' : 'Part 2: 組織評価（30問）'}
          </h1>
          <p className={`text-sm ${isPartOne ? 'text-blue-700' : 'text-green-700'}`}>
            {behavior
              ? (isPartOne
                  ? 'この半年で、自分が実際に行動したことを振り返りながら回答してください。'
                  : 'この半年で、組織・チームの中で実際に起きたことを振り返りながら回答してください。')
              : (isPartOne
                  ? '自分自身の対話力について、日頃の行動を振り返りながら回答してください。'
                  : 'あなたの組織・チームの状況について、実態を踏まえて回答してください。')
            }
          </p>
        </div>

        {/* Name & Date input (only on part1) */}
        {isPartOne && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  お名前（任意）
                </label>
                <input
                  type="text"
                  value={respondentName}
                  onChange={e => setRespondentName(e.target.value)}
                  placeholder="匿名でも回答できます"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  日付（任意）
                </label>
                <input
                  type="date"
                  value={respondentDate}
                  onChange={e => setRespondentDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>
          </div>
        )}

        {/* Score guide */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <p className="text-xs font-medium text-slate-600 mb-2">回答スケール</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-6 h-6 bg-slate-100 text-slate-600 rounded text-xs flex items-center justify-center font-bold">{s}</span>
                <span className="text-xs text-slate-500">{behavior ? SCORE_LABELS_BEHAVIOR[s] : SCORE_LABELS_ATTITUDE[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Questions */}
        {(blind || behavior) ? (
          // Blind/behavior mode: flat list, no muscle grouping/headers
          <div className="space-y-3">
            {currentQuestions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                value={answers[q.id]}
                onChange={handleAnswer}
                index={i}
                blind={true}
                behavior={behavior}
              />
            ))}
          </div>
        ) : (
          // Normal mode: grouped by muscle with headers
          <div className="space-y-8">
            {groups.map(group => (
              <div key={group.muscle.index}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-semibold text-slate-700">
                    {group.muscle.name}
                    <span className="ml-2 text-xs font-normal text-slate-400">({group.muscle.nameEn})</span>
                  </h2>
                </div>
                <div className="space-y-3">
                  {group.questions.map((q) => {
                    const globalIndex = currentQuestions.indexOf(q);
                    return (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        value={answers[q.id]}
                        onChange={handleAnswer}
                        index={globalIndex}
                        blind={false}
                        behavior={behavior}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="sticky bottom-0 mt-8 pb-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-lg">
            {isPartOne ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {part1Answered ? 'Part 1 完了！' : `残り ${totalQuestions - currentAnsweredCount} 問`}
                  </p>
                  <p className="text-xs text-slate-400">次へ進むと組織評価になります</p>
                </div>
                <button
                  onClick={() => { setPageState('part2'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={!part1Answered}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Part 2 へ進む
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPageState('part1'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-100 transition"
                  >
                    ← Part 1 に戻る
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 mb-1">
                    {part2Answered ? '全問回答済みです' : `残り ${totalQuestions - currentAnsweredCount} 問`}
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={!part2Answered || pageState === 'submitting'}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {pageState === 'submitting' ? '送信中...' : '回答を送信する'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
