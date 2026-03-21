'use client';

import { useState, useEffect, useCallback } from 'react';
import Logo from '@/components/Logo';

interface SurveyWithCount {
  id: string;
  token: string;
  organizationName: string;
  createdAt: string;
  responseCount: number;
}

export default function AdminPage() {
  const [surveys, setSurveys] = useState<SurveyWithCount[]>([]);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchSurveys = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/surveys');
      if (res.ok) {
        const data = await res.json();
        setSurveys(data);
      }
    } catch {
      // silently fail
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      setError('組織名を入力してください');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: orgName.trim() }),
      });
      if (res.ok) {
        setOrgName('');
        await fetchSurveys();
      } else {
        const data = await res.json();
        setError(data.error || '作成に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const getSurveyUrl = (token: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/survey/${token}`;
    }
    return `/survey/${token}`;
  };

  const handleCopyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getSurveyUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = getSurveyUrl(token);
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo size="md" showSubtitle />
          <div className="text-sm text-slate-500 hidden sm:block">
            管理画面
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            デモクラシーフィットネス診断
          </h1>
          <p className="text-slate-500 text-sm sm:text-base">
            組織の対話力を10の筋肉から診断するサーベイシステムです。組織ごとにサーベイを作成し、回答リンクを共有してください。
          </p>
        </div>

        {/* Create form */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">+</span>
            新規サーベイを作成
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="組織名を入力（例：株式会社〇〇）"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                disabled={loading}
              />
              {error && (
                <p className="text-red-500 text-sm mt-1">{error}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              {loading ? '作成中...' : 'サーベイを作成'}
            </button>
          </form>
        </div>

        {/* Survey list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">
              サーベイ一覧
              {!fetching && (
                <span className="ml-2 text-sm font-normal text-slate-400">
                  ({surveys.length}件)
                </span>
              )}
            </h2>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg className="w-12 h-12 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">サーベイがまだありません</p>
              <p className="text-xs mt-1">上のフォームから作成してください</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {surveys.map(survey => (
                <div key={survey.id} className="px-6 py-4 hover:bg-slate-50 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-slate-800 truncate">
                          {survey.organizationName}
                        </h3>
                        <span className="flex-shrink-0 inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {survey.responseCount}名回答
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        作成日: {formatDate(survey.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleCopyLink(survey.token)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 transition"
                      >
                        {copiedToken === survey.token ? (
                          <>
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-600">コピー済み</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            リンクコピー
                          </>
                        )}
                      </button>
                      <a
                        href={`/results/${survey.token}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        結果を見る
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
              <span className="text-white text-sm font-bold">10</span>
            </div>
            <h3 className="font-semibold text-blue-800 mb-1">10の筋肉</h3>
            <p className="text-blue-700 text-xs">好奇心、傾聴、共感、勇気、意見、反対意見、言葉への自信、妥協、活動家、動員</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center mb-3">
              <span className="text-white text-sm font-bold">60</span>
            </div>
            <h3 className="font-semibold text-green-800 mb-1">60の質問</h3>
            <p className="text-green-700 text-xs">個人評価（Part 1）と組織評価（Part 2）に分けた2段階サーベイ</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center mb-3">
              <span className="text-white text-sm font-bold">2</span>
            </div>
            <h3 className="font-semibold text-yellow-800 mb-1">2つの可視化</h3>
            <p className="text-yellow-700 text-xs">レーダーチャートと4象限マトリクスで組織の強みと課題を一目で把握</p>
          </div>
        </div>
      </main>
    </div>
  );
}
