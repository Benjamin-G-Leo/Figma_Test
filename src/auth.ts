import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScoreStore } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Without the env vars the game still works as guest-only.
export const authEnabled = Boolean(url && key);
const client: SupabaseClient | null = authEnabled ? createClient(url!, key!) : null;

export interface Account {
  id: string;
  username: string;
}

export interface LeaderboardRow {
  username: string;
  high_score: number;
}

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: true; account: null; needsConfirm: true }
  | { ok: false; error: string };

type SupaUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

function toAccount(user: SupaUser): Account {
  const meta = user.user_metadata?.username;
  const username = typeof meta === 'string' && meta ? meta : (user.email ?? 'player').split('@')[0];
  return { id: user.id, username };
}

export async function getAccount(): Promise<Account | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session ? toAccount(data.session.user) : null;
  } catch {
    return null;
  }
}

export async function signUp(username: string, email: string, password: string): Promise<AuthResult> {
  if (!client) return { ok: false, error: 'Accounts are not set up.' };

  // Usernames are unique; check first so the player gets a clear message.
  const { data: available, error: checkError } = await client.rpc('username_available', { p_name: username });
  if (checkError) return { ok: false, error: 'Could not check that username. Try again.' };
  if (available !== true) return { ok: false, error: 'That username is taken or not allowed.' };

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) {
    // The database refuses the account if someone grabbed the name a moment ago.
    if (/database error/i.test(error.message)) {
      return { ok: false, error: 'That username was just taken. Pick another.' };
    }
    return { ok: false, error: error.message };
  }
  // Supabase hides "already registered" behind a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, error: 'That email is already registered. Try logging in.' };
  }
  if (!data.session || !data.user) return { ok: true, account: null, needsConfirm: true };
  return { ok: true, account: toAccount(data.user) };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!client) return { ok: false, error: 'Accounts are not set up.' };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, account: toAccount(data.user) };
}

// Fires when the session ends for any reason (expired, revoked, signed out elsewhere).
export function onSignedOut(callback: () => void): void {
  client?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
}

export async function signOut(): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (error) {
    console.warn('Sign out failed:', error);
  }
}

export async function fetchCloudScore(account: Account): Promise<number> {
  if (!client) return 0;
  try {
    const { data, error } = await client
      .from('scores')
      .select('high_score')
      .eq('user_id', account.id)
      .maybeSingle();
    if (error) throw error;
    return data?.high_score ?? 0;
  } catch (error) {
    console.warn('Could not load saved score:', error);
    return 0;
  }
}

// Top players, best first. `failed` is true when the server could not be reached.
export async function fetchLeaderboard(limit = 10): Promise<{ rows: LeaderboardRow[]; failed: boolean }> {
  if (!client) return { rows: [], failed: true };
  try {
    const { data, error } = await client
      .from('scores')
      .select('username, high_score')
      .gt('high_score', 0)
      .order('high_score', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return { rows: data ?? [], failed: false };
  } catch (error) {
    console.warn('Could not load leaderboard:', error);
    return { rows: [], failed: true };
  }
}

// 1-based rank of a score (players with a higher score, plus one).
export async function fetchRank(score: number): Promise<number | null> {
  if (!client || score <= 0) return null;
  try {
    const { count, error } = await client
      .from('scores')
      .select('user_id', { count: 'exact', head: true })
      .gt('high_score', score);
    if (error) throw error;
    return (count ?? 0) + 1;
  } catch (error) {
    console.warn('Could not load rank:', error);
    return null;
  }
}

// Score store backed by the player's account; `initial` is their saved best.
// Calls go out one at a time, so "start run" can never overtake the previous "submit".
export function createCloudScoreStore(initial: number): ScoreStore {
  let best = initial;
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = (label: string, task: () => PromiseLike<{ error: unknown }>): void => {
    queue = queue.then(async () => {
      try {
        const { error } = await task();
        if (error) throw error;
      } catch (error) {
        console.warn(`${label} failed:`, error);
      }
    });
  };

  return {
    load: () => best,
    flush: () => queue.then(() => undefined),
    startRun: () => {
      if (client) enqueue('Start run', () => client.rpc('start_run'));
    },
    save: (score: number) => {
      if (score <= best) return;
      best = score;
      if (client) enqueue('Save score', () => client.rpc('submit_score', { p_score: score }));
    }
  };
}
