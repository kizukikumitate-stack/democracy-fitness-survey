'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import Logo from '@/components/Logo';

type Signup = {
  id: string;
  created_at: string;
  name: string | null;
  email: string;
  event_id: string | null;
  event_name: string | null;
  attended: boolean | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
};

const STORAGE_KEY = 'eventsAdminKey';

function mstr(m: Record<string, unknown> | null, key: string): string {
  const v = m?.[key];
  return typeof v === 'string' ? v : '';
}
function mbool(m: Record<string, unknown> | null, key: string): boolean {
  return m?.[key] === true;
}
function formatDateTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function EventsDashboardPage() {
  const [keyInput, setKeyInput] = useState('');
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/event-signups', { headers: { 'x-admin-key': key } });
      if (res.status === 401) {
        setAuthed(false);
        setError('パスワードが正しくありません。');
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        setAuthed(false);
        setError(body.message || 'サーバー側でパスワード（EVENTS_ADMIN_KEY）が未設定です。');
        return;
      }
      if (!res.ok) {
        setAuthed(false);
        setError(`読み込みに失敗しました（${res.status}）`);
        return;
      }
      const data = await res.json();
      setSignups(data.signups ?? []);
      setAuthed(true);
      setAdminKey(key);
      sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      setKeyInput(saved);
      load(saved);
    }
  }, [load]);

  // イベント別の集計
  const groups = useMemo(() => {
    const map = new Map<string, { event_id: string; event_name: string; count: number; latest: string }>();
    for (const s of signups) {
      const id = s.event_id ?? '(不明)';
      const g = map.get(id);
      if (g) {
        g.count += 1;
        if (s.created_at > g.latest) g.latest = s.created_at;
      } else {
        map.set(id, { event_id: id, event_name: s.event_name ?? id, count: 1, latest: s.created_at });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [signups]);

  const filtered = useMemo(
    () => (filterEvent === 'all' ? signups : signups.filter(s => (s.event_id ?? '(不明)') === filterEvent)),
    [signups, filterEvent],
  );

  const exportCsv = () => {
    const headers = ['申込日時', 'イベント名', 'event_id', '氏名', 'ふりがな', 'メール', '電話', 'きっかけ', '過去体験会参加', '出席', 'source', 'metadata'];
    const rows = filtered.map(s => [
      formatDateTime(s.created_at),
      s.event_name ?? '',
      s.event_id ?? '',
      s.name ?? '',
      mstr(s.metadata, 'furigana'),
      s.email,
      mstr(s.metadata, 'phone'),
      mstr(s.metadata, 'referralSource'),
      mbool(s.metadata, 'pastParticipation') ? 'あり' : 'なし',
      s.attended ? '出席' : '未',
      s.source ?? '',
      JSON.stringify(s.metadata ?? {}),
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `event-signups-${filterEvent === 'all' ? 'all' : filterEvent}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 未認証：パスワード入力 ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <Logo size="md" showSubtitle />
            <div className="text-sm text-slate-500 hidden sm:block">イベント申込ダッシュボード</div>
          </div>
        </header>
        <main className="max-w-md mx-auto px-4 py-16">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h1 className="text-lg font-semibold text-slate-800 mb-2">パスワードを入力</h1>
            <p className="text-slate-500 text-sm mb-4">
              申込者の個人情報を含むため、閲覧にはパスワードが必要です。
            </p>
            <form
              onSubmit={e => { e.preventDefault(); if (keyInput.trim()) load(keyInput.trim()); }}
              className="flex flex-col gap-3"
            >
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="パスワード"
                autoFocus
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {loading ? '確認中...' : '開く'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ── 認証済み：ダッシュボード ──
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo size="md" showSubtitle />
          <div className="flex items-center gap-3">
            <button
              onClick={() => adminKey && load(adminKey)}
              className="text-sm text-slate-500 hover:text-slate-800 transition"
              title="再読み込み"
            >
              ↻ 更新
            </button>
            <button
              onClick={() => { sessionStorage.removeItem(STORAGE_KEY); setAuthed(false); setSignups([]); setKeyInput(''); }}
              className="text-sm text-slate-400 hover:text-slate-700 transition"
            >
              ロック
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">イベント申込ダッシュボード</h1>
          <p className="text-slate-500 text-sm">体験会・合宿の申込状況（Supabase event_signups）。合計 {signups.length} 件。</p>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {groups.map(g => (
            <button
              key={g.event_id}
              onClick={() => setFilterEvent(filterEvent === g.event_id ? 'all' : g.event_id)}
              className={`text-left bg-white rounded-xl border shadow-sm p-5 transition hover:shadow-md ${filterEvent === g.event_id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}
            >
              <div className="text-xs text-slate-400 mb-1 truncate">{g.event_id}</div>
              <div className="text-sm font-semibold text-slate-800 mb-2 leading-snug">{g.event_name}</div>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-blue-600">{g.count}<span className="text-sm font-normal text-slate-400 ml-1">件</span></span>
                <span className="text-xs text-slate-400">最新 {formatDateTime(g.latest)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* ツールバー */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => setFilterEvent('all')}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${filterEvent === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            すべて（{signups.length}）
          </button>
          {groups.map(g => (
            <button
              key={g.event_id}
              onClick={() => setFilterEvent(g.event_id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${filterEvent === g.event_id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {g.event_name}（{g.count}）
            </button>
          ))}
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition"
          >
            CSVダウンロード（{filtered.length}件）
          </button>
        </div>

        {/* 一覧テーブル */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">申込はまだありません。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-left">
                    <th className="px-4 py-3 font-medium whitespace-nowrap">申込日時</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">イベント</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">氏名</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">メール</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">電話</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">きっかけ</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">詳細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(s => {
                    const isOpen = expanded === s.id;
                    const entries = Object.entries(s.metadata ?? {}).filter(
                      ([, v]) => v !== null && v !== '' && v !== false,
                    );
                    return (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-slate-50 transition align-top">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(s.created_at)}</td>
                          <td className="px-4 py-3 text-slate-700">{s.event_name ?? s.event_id}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-800">
                            {s.name || '（未記入）'}
                            {mstr(s.metadata, 'furigana') && (
                              <span className="block text-xs text-slate-400 font-normal">{mstr(s.metadata, 'furigana')}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <a href={`mailto:${s.email}`} className="text-blue-600 hover:underline">{s.email}</a>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">{mstr(s.metadata, 'phone') || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[14rem] truncate" title={mstr(s.metadata, 'referralSource')}>
                            {mstr(s.metadata, 'referralSource') || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => setExpanded(isOpen ? null : s.id)}
                              className="text-slate-500 hover:text-blue-600 transition text-xs"
                            >
                              {isOpen ? '閉じる ▲' : '開く ▼'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={7} className="px-4 py-4">
                              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                {entries.length === 0 && <span className="text-slate-400 text-sm">追加情報なし</span>}
                                {entries.map(([k, v]) => (
                                  <div key={k} className="flex gap-2 text-sm">
                                    <dt className="text-slate-400 whitespace-nowrap min-w-[8rem]">{k}</dt>
                                    <dd className="text-slate-700 break-all">
                                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              <div className="mt-3 text-xs text-slate-400">source: {s.source ?? '—'} ／ id: {s.id}</div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
