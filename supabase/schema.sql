-- Volt Runner database setup. Safe to run more than once (also upgrades the first version).
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- (Supabase warns about "destructive operations" because of the `drop ... if exists` lines.
--  They only touch objects this script manages.)

-- ===== Tables =====

-- One row per account: display name + best score.
create table if not exists public.scores (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  high_score integer not null default 0 check (high_score >= 0),
  updated_at timestamptz not null default now()
);

alter table public.scores drop constraint if exists scores_username_check;
alter table public.scores drop constraint if exists scores_username_format;
alter table public.scores
  add constraint scores_username_format check (username ~ '^[A-Za-z0-9_]{3,16}$');

-- Usernames are unique, ignoring upper/lower case.
create unique index if not exists scores_username_unique on public.scores (lower(username));
create index if not exists scores_high_score_idx on public.scores (high_score desc);

-- One open run per player. The SERVER records when a run started, so the browser
-- cannot lie about how long it lasted.
create table if not exists public.runs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now()
);

-- ===== Access rules =====

alter table public.scores enable row level security;
alter table public.runs enable row level security;

-- Anyone can read the leaderboard.
drop policy if exists "scores are readable by everyone" on public.scores;
create policy "scores are readable by everyone"
  on public.scores for select
  using (true);

-- Nobody writes to the tables directly any more. Writes go through the
-- functions below, which check the run first.
drop policy if exists "players insert own score" on public.scores;
drop policy if exists "players update own score" on public.scores;
drop trigger if exists keep_best_score on public.scores;
drop function if exists public.keep_best_score();

revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;
revoke all on public.runs from anon, authenticated;

-- ===== Helpers =====

create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_name) = any (array[
    'admin', 'administrator', 'moderator', 'mod', 'staff', 'support', 'system',
    'root', 'owner', 'guest', 'anonymous', 'null', 'undefined',
    'voltrunner', 'volt_runner'
  ]);
$$;

-- ===== Username swear filter =====
-- Words live in a table so you can add or remove them in Supabase (Table Editor ->
-- blocked_words) without touching code. Lower-case letters only.
--   whole_word = false: blocked anywhere inside the name ("xxfuckxx").
--   whole_word = true : blocked only as a separate word, where words are split at
--                       underscores, digits and CamelCase ("Big_Ass", "BigAss", "ass99").
-- Use whole_word = true for short words that appear inside innocent names
-- (Class, Hancock, Therapist, Matsushita, Swank).
-- Look-alike digits count as letters: 0=o 1=i 3=e 4=a 5=s 7=t ("sh1t" -> "shit").
-- Limits: a determined person can still dodge it (e.g. "fvck"); it only catches obvious cases.

create table if not exists public.blocked_words (
  word       text primary key check (word ~ '^[a-z]+$'),
  whole_word boolean not null default false
);

alter table public.blocked_words enable row level security;
revoke all on public.blocked_words from anon, authenticated;

insert into public.blocked_words (word, whole_word) values
  ('fuck', false), ('bitch', false), ('cunt', false), ('nigg', false), ('fagg', false),
  ('whore', false), ('slut', false), ('penis', false), ('vagina', false), ('dildo', false),
  ('pussy', false), ('porn', false), ('asshole', false), ('arsehole', false),
  ('dumbass', false), ('jackass', false), ('bullshit', false), ('shithead', false),
  ('shitty', false), ('dipshit', false), ('hitler', false), ('retard', false),
  ('blowjob', false), ('handjob', false), ('jizz', false),
  ('ass', true), ('arse', true), ('shit', true), ('shite', true), ('dick', true),
  ('cock', true), ('tit', true), ('tits', true), ('anus', true), ('anal', true),
  ('sex', true), ('sexy', true), ('fag', true), ('fuk', true), ('fck', true),
  ('sht', true), ('cum', true), ('wank', true), ('twat', true), ('rape', true),
  ('rapist', true), ('nazi', true), ('kkk', true), ('coon', true), ('spic', true),
  ('kike', true), ('chink', true), ('gook', true), ('tranny', true), ('negro', true)
on conflict (word) do nothing;

create or replace function public.contains_blocked_word(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  with base as (
    select lower(regexp_replace(p_name, '([a-z0-9])([A-Z])', '\1_\2', 'g')) as s
  ),
  tokens as (
    select regexp_replace(t, '[0-9]+', '', 'g') as t
      from base, regexp_split_to_table(base.s, '_+') as t
    union
    select translate(t, '013457', 'oieast')
      from base, regexp_split_to_table(base.s, '_+') as t
  )
  select exists (
           select 1 from public.blocked_words w, base
            where not w.whole_word
              and replace(translate(base.s, '013457', 'oieast'), '_', '') like '%' || w.word || '%'
         )
      or exists (
           select 1 from public.blocked_words w join tokens on tokens.t = w.word
            where w.whole_word
         );
$$;

-- Reserved names + swear words. Existing accounts are not renamed if a word is added later.
create or replace function public.is_blocked_username(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_reserved_username(p_name) or public.contains_blocked_word(p_name);
$$;

-- Highest score a run of this many seconds could honestly reach.
-- Orbs spawn at most once a second and the nth orb in a row is worth 10*n, so a
-- perfect run scores about 5*n^2 + 5*n with n = seconds + 2. Never above the hard
-- cap. Tune both numbers here if you change the game's scoring.
create or replace function public.max_plausible_score(p_seconds numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(200000, floor(5 * power(p_seconds + 2, 2) + 5 * (p_seconds + 2)))::integer;
$$;

-- ===== Functions the game calls =====

-- Sign-up form uses this to check a name before creating the account.
create or replace function public.username_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_name ~ '^[A-Za-z0-9_]{3,16}$', false)
     and not public.is_blocked_username(p_name)
     and not exists (select 1 from public.scores where lower(username) = lower(p_name));
$$;

-- Claim the username the moment an account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := new.raw_user_meta_data ->> 'username';
begin
  if v_name ~ '^[A-Za-z0-9_]{3,16}$' and not public.is_blocked_username(v_name) then
    insert into public.scores (user_id, username, high_score) values (new.id, v_name, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called when a run starts.
create or replace function public.start_run()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.runs (user_id, started_at) values (auth.uid(), now())
  on conflict (user_id) do update set started_at = now();
end;
$$;

-- Called at game over with the run's score. One submission per run.
create or replace function public.submit_score(p_score integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_started timestamptz;
  v_seconds numeric;
  v_name    text;
  v_best    integer;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  delete from public.runs where user_id = v_uid returning started_at into v_started;
  if v_started is null then
    raise exception 'no run in progress';
  end if;

  v_seconds := extract(epoch from (now() - v_started));
  if p_score is null or p_score < 0 or p_score > public.max_plausible_score(v_seconds) then
    raise exception 'score not plausible for a % second run', round(v_seconds);
  end if;

  select raw_user_meta_data ->> 'username' into v_name from auth.users where id = v_uid;
  if v_name is null
     or v_name !~ '^[A-Za-z0-9_]{3,16}$'
     or public.is_blocked_username(v_name)
     or exists (select 1 from public.scores where lower(username) = lower(v_name) and user_id <> v_uid)
  then
    v_name := 'player_' || substr(replace(v_uid::text, '-', ''), 1, 8);
  end if;

  insert into public.scores (user_id, username, high_score)
  values (v_uid, v_name, p_score)
  on conflict (user_id) do update
    set high_score = greatest(public.scores.high_score, excluded.high_score),
        updated_at = now()
  returning high_score into v_best;

  return v_best;
end;
$$;

-- ===== Who may call what =====

revoke all on function
  public.is_reserved_username(text),
  public.contains_blocked_word(text),
  public.is_blocked_username(text),
  public.max_plausible_score(numeric),
  public.username_available(text),
  public.handle_new_user(),
  public.start_run(),
  public.submit_score(integer)
from public, anon, authenticated;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.start_run() to authenticated;
grant execute on function public.submit_score(integer) to authenticated;
