-- 「あなたの職場の妖怪を教えてください」投稿を貯めるテーブル。
-- 森本が status を 'approved' にしたものだけが公開ギャラリー(/yokai/gallery.html)に載る。
-- 個人情報は保存しない(匿名)。
--
-- 適用方法: Supabase Dashboard → SQL Editor → New Query にこの内容を貼り付けて Run
--
-- 選定(承認)の仕方: Table Editor で対象行の status を 'approved' に変更するだけ。
--   ・表示順を上げたい場合は display_order に小さい数字(例:1,2,3...)を入れる(null は新着順)
--   ・却下は status を 'rejected' に(公開されない)

create table if not exists public.yokai_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,                                 -- 妖怪の名前案(任意)
  description text not null,                  -- どんな妖怪か・職場での症状(必須)
  kuse text,                                  -- 口癖(任意)
  status text not null default 'pending',     -- pending / approved / rejected
  approved_at timestamptz,
  display_order int,                          -- ギャラリー表示順(小さいほど上・null は新着順)
  source text default 'yokai-submit-v1'
);

create index if not exists yokai_submissions_status_idx
  on public.yokai_submissions (status);
create index if not exists yokai_submissions_created_at_idx
  on public.yokai_submissions (created_at desc);

-- 第一号(編集部シード): 責任回避の妖怪「他人事のっぺら」を承認済みで投入(重複実行しても増えない)
insert into public.yokai_submissions (name, description, kuse, status, approved_at, display_order, source)
select
  '他人事のっぺら',
  '「自分の担当ではない」と皆が一歩引き、責任の主体が消える。対立が起きる前に、誰も本気で関わらなくなる。',
  'それ、うちの担当でしたっけ？',
  'approved', now(), 0, 'official-seed'
where not exists (
  select 1 from public.yokai_submissions
  where source = 'official-seed' and name = '他人事のっぺら'
);

-- RLS: 投稿・ギャラリー参照はいずれも API(service_role)経由。service_role は RLS をバイパスする。
alter table public.yokai_submissions enable row level security;
