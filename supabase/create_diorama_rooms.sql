-- ステークホルダー・ジオラマ（https://kizukikumitate-stack.github.io/stakeholder-diorama/）の
-- ライブ配信用テーブル。Claude.ai アーティファクトの window.storage（共有KV）を置き換える。
-- 同期はフロントからの 3.5 秒ポーリング（/api/diorama-room の action=getRoom）で行う。
-- ★ このSQLは Supabase SQL Editor で手動実行が必要（既存 yokai_rooms 等と同じプロジェクト democracy-fitness）。
--
-- 書き込みは全て Vercel の API ルート（service_role）経由。ブラウザから直接 Supabase は叩かない。
-- そのため RLS は「有効化＋ポリシー無し」＝anon/publicは全拒否、service_role はRLSをバイパス、という最小構成。
--
-- アーティファクト版は配信先が全体で1つ（LIVE_KEY）だったが、公開URLでは複数のファシリテーターが
-- 同時に使うと混線するため、合言葉（code）で部屋を分ける。

create table if not exists diorama_rooms (
  code       text primary key,                                  -- 合言葉（正規化済み小文字）
  data       jsonb not null default '{}',                       -- 盤面全体（theme/scale/stakeholders/data/valueChain/themeIdeas）
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index if not exists idx_diorama_rooms_expires on diorama_rooms(expires_at);

-- ============ 期限切れ部屋の掃除（pg_cron 等から定期実行してもよい／未設定でも動作に支障なし） ============
create or replace function cleanup_expired_diorama_rooms()
returns integer
language sql
as $$
  with deleted as (
    delete from diorama_rooms where expires_at < now() returning code
  )
  select count(*)::int from deleted;
$$;

-- ============ RLS：有効化のみ（ポリシー無し＝anon全拒否、service_role はバイパス） ============
alter table diorama_rooms enable row level security;
