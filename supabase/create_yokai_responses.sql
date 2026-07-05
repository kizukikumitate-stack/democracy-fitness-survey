-- 妖怪と式神 診断(/yokai/) の結果を匿名で集計するためのテーブルとビュー。
-- 「日本の組織にどの妖怪が多いか」を集計する用途。個人情報は保存しない。
--
-- 適用方法: Supabase Dashboard → SQL Editor → New Query にこの内容を貼り付けて Run

create table if not exists public.yokai_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  main_yokai_id smallint,                          -- 1..10 が一番強い妖怪 / null = 妖怪なし(式神が機能)
  hit_yokai_ids smallint[] not null default '{}',  -- 今回出現した妖怪id(重複なし)
  hits jsonb not null default '[]',                -- [{ "id": 1, "count": 2 }, ...] 各妖怪の該当数
  total_hits smallint not null default 0,          -- 出現した妖怪の数(= hit_yokai_ids の長さ)
  source text default 'yokai-diagnosis-v1'
);

create index if not exists yokai_responses_created_at_idx
  on public.yokai_responses (created_at desc);
create index if not exists yokai_responses_main_idx
  on public.yokai_responses (main_yokai_id);

-- 集計ビュー(API は service_role で参照する)

-- 「1位(一番強い妖怪)」に選ばれた回数
create or replace view public.yokai_main_ranking as
  select main_yokai_id as yokai_id, count(*)::int as n
  from public.yokai_responses
  where main_yokai_id is not null
  group by main_yokai_id;

-- 「出現した妖怪」の回数(1位以外も含む全体傾向)
create or replace view public.yokai_appearance_ranking as
  select y::int as yokai_id, count(*)::int as n
  from public.yokai_responses, unnest(hit_yokai_ids) as y
  group by y;

-- RLS: 書き込み・集計参照はいずれも API(service_role)経由で行う。
-- service_role は RLS をバイパスするため、匿名向けポリシーは付けない(直接アクセスは不可)。
alter table public.yokai_responses enable row level security;
