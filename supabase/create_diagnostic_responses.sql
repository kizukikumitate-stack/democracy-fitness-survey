-- BEM 診断フォーム(/series/diagnostic.html) の回答を保存するテーブル
-- 顧客資産として保有し、メルマガ配信のソースとしても使う
--
-- 適用方法: Supabase Dashboard → SQL Editor → New Query にこの内容を貼り付けて Run

create table if not exists public.diagnostic_responses (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  industry text,
  role text,
  type text not null,                    -- A / B / C / D / E
  scores jsonb,                          -- { e1: 8, e1_pct: 1.0, e2: ..., ... }
  answers jsonb,                         -- 各質問への回答(後の分析用)
  newsletter_opt_in boolean not null default false,
  source text default 'diagnostic-form-v1',
  created_at timestamptz not null default now()
);

create index if not exists diagnostic_responses_email_idx
  on public.diagnostic_responses (email);

create index if not exists diagnostic_responses_created_at_idx
  on public.diagnostic_responses (created_at desc);

create index if not exists diagnostic_responses_type_idx
  on public.diagnostic_responses (type);

create index if not exists diagnostic_responses_newsletter_opt_in_idx
  on public.diagnostic_responses (newsletter_opt_in)
  where newsletter_opt_in = true;

-- RLS: 匿名キーからは insert のみ許可。SELECT は service_role でのみ
alter table public.diagnostic_responses enable row level security;

drop policy if exists "anon can insert diagnostic responses"
  on public.diagnostic_responses;
create policy "anon can insert diagnostic responses"
  on public.diagnostic_responses
  for insert
  to anon
  with check (true);
