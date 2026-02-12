-- ================================
-- 영화과 아카이브 - Supabase 스키마
-- Supabase 대시보드 → SQL Editor에서 순서대로 실행하세요.
-- ================================

-- 1. 프로필 (학번, 이름) - auth.users와 1:1
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id text unique not null,
  name text not null
);

alter table public.profiles enable row level security;

create policy "자기 프로필만 삽입"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "프로필은 모두 조회 가능"
  on public.profiles for select
  using (true);

create policy "자기 프로필만 수정"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. 영상
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  director_id uuid references auth.users(id) on delete set null,
  director_name text not null,
  year int not null,
  genre text not null,
  category text not null,
  duration text not null,
  youtube_url text not null,
  thumbnail text,
  description text,
  views int default 0,
  created_at timestamptz default now()
);

alter table public.videos enable row level security;

create policy "영상은 모두 조회 가능"
  on public.videos for select
  using (true);

create policy "로그인 사용자만 영상 추가"
  on public.videos for insert
  with check (auth.uid() is not null);

-- 3. 영상 좋아요
create table if not exists public.video_likes (
  video_id uuid references public.videos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (video_id, user_id)
);

alter table public.video_likes enable row level security;

create policy "좋아요 목록 조회 가능"
  on public.video_likes for select
  using (true);

create policy "자기 좋아요만 추가/삭제"
  on public.video_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. 댓글
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.comments enable row level security;

create policy "댓글 조회 가능"
  on public.comments for select
  using (true);

create policy "로그인 사용자만 댓글 작성"
  on public.comments for insert
  with check (auth.uid() is not null);

-- (선택) 이메일 인증 비활성화 시 Supabase 대시보드에서
-- Authentication → Providers → Email → "Confirm email" 끄기
-- 학번@filmarchive.local 로 가입 시 바로 로그인 가능
