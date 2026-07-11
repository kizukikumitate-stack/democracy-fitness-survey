-- 妖怪と式神ワークショップ（対話の間=ソロ / 寄合の間=複数人）本番移植用テーブル。
-- Claude.ai アーティファクトの window.storage（共有KV）を置き換える。
-- 同期はフロントからの短間隔ポーリング（/api/yokai-room の action=sync）で行う。
-- ★ このSQLは Supabase SQL Editor で手動実行が必要（既存 yokai_responses 等と同じプロジェクト democracy-fitness）。
--
-- 書き込みは全て Vercel の API ルート（service_role）経由。ブラウザから直接 Supabase は叩かない。
-- そのため RLS は「有効化＋ポリシー無し」＝anon/publicは全拒否、service_role はRLSをバイパス、という最小構成。

-- ============ ルーム（複数人版：1レコード=1セッション） ============
create table if not exists yokai_rooms (
  code       text primary key,                                  -- 合言葉（正規化済み小文字）
  data       jsonb not null default '{}',                       -- 部屋オブジェクト全体（phase/mode/hostId/candidates/yokai/type/card/sadame/teamName 等）
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

-- ============ 参加者（複数人版：1レコード=1人） ============
create table if not exists yokai_participants (
  room_code  text not null references yokai_rooms(code) on delete cascade,
  pid        text not null,                                     -- クライアント発行の参加者ID
  data       jsonb not null default '{}',                       -- name/joined/sightings[]/yokai/ready/voteName/voteType/voteCard/answer/verbs[]/posted 等
  updated_at timestamptz not null default now(),
  primary key (room_code, pid)
);

-- ============ 絵馬（奉納された契約） ============
-- room_code = null はソロ版（対話の間）の公開絵馬掛所。
create table if not exists yokai_emas (
  id         text primary key,                                  -- クライアント発行のID（Date.now系）
  room_code  text,                                              -- null=ソロ公開ボード / それ以外=その部屋の絵馬掛所
  yokai      text not null,
  by_name    text,
  taiji_type text,
  card       text,
  verbs      text[] not null default '{}',
  practice   text,
  message    text,
  ema_date   text,
  reactions  integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_yokai_participants_room on yokai_participants(room_code);
create index if not exists idx_yokai_emas_room on yokai_emas(room_code, created_at desc);
create index if not exists idx_yokai_rooms_expires on yokai_rooms(expires_at);

-- ============ リアクション加算（連打で数が飛ばないよう単一UPDATE） ============
create or replace function increment_yokai_reaction(p_id text)
returns integer
language sql
as $$
  update yokai_emas set reactions = reactions + 1 where id = p_id returning reactions;
$$;

-- ============ 期限切れルームの掃除（pg_cron 等から定期実行してもよい／未設定でも動作に支障なし） ============
create or replace function cleanup_expired_yokai_rooms()
returns integer
language sql
as $$
  with deleted as (
    delete from yokai_rooms where expires_at < now() returning code
  )
  select count(*)::int from deleted;
$$;

-- ============ RLS：有効化のみ（ポリシー無し＝anon全拒否、service_role はバイパス） ============
alter table yokai_rooms        enable row level security;
alter table yokai_participants enable row level security;
alter table yokai_emas         enable row level security;
