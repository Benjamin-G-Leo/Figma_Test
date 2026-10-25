-- Volt Runner: one row per account holding the player's best score.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.scores (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (char_length(username) between 3 and 16),
  high_score integer not null default 0 check (high_score >= 0),
  updated_at timestamptz not null default now()
);

alter table public.scores enable row level security;

-- Anyone can read scores (for a future leaderboard).
drop policy if exists "scores are readable by everyone" on public.scores;
create policy "scores are readable by everyone"
  on public.scores for select
  using (true);

-- Players can only create and change their own row.
drop policy if exists "players insert own score" on public.scores;
create policy "players insert own score"
  on public.scores for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "players update own score" on public.scores;
create policy "players update own score"
  on public.scores for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A score can only go up, never down.
create or replace function public.keep_best_score()
returns trigger
language plpgsql
as $$
begin
  new.high_score := greatest(old.high_score, new.high_score);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists keep_best_score on public.scores;
create trigger keep_best_score
  before update on public.scores
  for each row execute function public.keep_best_score();

-- Newer Supabase projects need explicit grants for the Data API.
grant select on public.scores to anon, authenticated;
grant insert, update on public.scores to authenticated;
