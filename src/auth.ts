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

const OFFLINE_MESSAGE = 'No internet connection. Log in when you are back online, or play as guest.';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// A failed request that never reached the server (no internet, DNS, blocked).
function isNetworkError(message: string): boolean {
  return /failed to fetch|network|load failed|fetch failed/i.test(message);
}

// While offline the login token can't be refreshed, so Supabase reports "no session"
// even though the player is still logged in. Read who they are from the saved login.
function readStoredAccount(): Account | null {
  try {
    const host = new URL(url!).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${host}-auth-token`);
    const user = raw ? JSON.parse(raw)?.user : null;
    return user?.id ? toAccount(user) : null;
  } catch {
    return null;
  }
}

export async function getAccount(): Promise<Account | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    if (data.session) return toAccount(data.session.user);
  } catch {
    // fall through to the offline check
  }
  return isOffline() ? readStoredAccount() : null;
}

export async function signUp(username: string, email: string, password: string): Promise<AuthResult> {
  if (!client) return { ok: false, error: 'Accounts are not set up.' };
  if (isOffline()) return { ok: false, error: OFFLINE_MESSAGE };

  // Usernames are unique; check first so the player gets a clear message.
  const { data: available, error: checkError } = await client.rpc('username_available', { p_name: username });
  if (checkError) {
    return { ok: false, error: isNetworkError(checkError.message) ? OFFLINE_MESSAGE : 'Could not check that username. Try again.' };
  }
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
    return { ok: false, error: isNetworkError(error.message) ? OFFLINE_MESSAGE : error.message };
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
  if (isOffline()) return { ok: false, error: OFFLINE_MESSAGE };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: isNetworkError(error.message) ? OFFLINE_MESSAGE : error.message };
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

// The last best score the server told us about, kept so the menu still shows it offline.
const cloudBestKey = (id: string) => `voltRunnerCloudBest:${id}`;

function readCachedCloudBest(id: string): number {
  try {
    const value = parseInt(localStorage.getItem(cloudBestKey(id)) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function cacheCloudBest(id: string, score: number): void {
  try {
    localStorage.setItem(cloudBestKey(id), String(score));
  } catch {
    // Storage blocked: offline menu just shows 0 until we are online again.
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
    const score = data?.high_score ?? 0;
    cacheCloudBest(account.id, score);
    return score;
  } catch (error) {
    console.warn('Could not load saved score:', error);
    return readCachedCloudBest(account.id);
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

// A new best that could not be sent live (no internet). It stays on this device and is
// sent later; `seconds` is how long that run lasted, so the server can sanity-check it.
interface PendingScore {
  score: number;
  seconds: number;
}

export type SyncEvent = 'pending' | 'synced' | 'rejected';

const pendingKey = (id: string) => `voltRunnerPending:${id}`;

function readPending(id: string): PendingScore | null {
  try {
    const raw = localStorage.getItem(pendingKey(id));
    const value = raw ? JSON.parse(raw) : null;
    return Number.isFinite(value?.score) && Number.isFinite(value?.seconds)
      ? { score: value.score, seconds: value.seconds }
      : null;
  } catch {
    return null;
  }
}

function writePending(id: string, pending: PendingScore | null): void {
  try {
    if (pending) localStorage.setItem(pendingKey(id), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(id));
  } catch {
    // Storage blocked: the score just can't wait for the next connection.
  }
}

// The server said no (a database "raise exception"), as opposed to a connection problem.
function isServerRejection(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P0001';
}

// Score store backed by the player's account; `initial` is their saved best.
// Calls go out one at a time, so "start run" can never overtake the previous "submit".
// Offline: the new best is kept on the device and sent when the network is back.
export function createCloudScoreStore(
  account: Account,
  initial: number,
  onChange: (event: SyncEvent) => void = () => {}
): ScoreStore {
  let cloudBest = initial;
  let best = Math.max(initial, readPending(account.id)?.score ?? 0);
  // Each run remembers whether the server knows about it (start_run worked).
  let run = { start: performance.now(), registered: false };
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task).catch((error) => console.warn('Cloud task failed:', error));
  };

  // Send a waiting score. Safe to call any time; it does nothing offline or with nothing waiting.
  const syncPending = async (): Promise<void> => {
    const pending = readPending(account.id);
    if (!pending || !client || isOffline()) return;

    const { data, error } = await client.rpc('submit_offline_score', {
      p_score: pending.score,
      p_seconds: pending.seconds
    });
    if (!error) {
      writePending(account.id, null);
      cloudBest = typeof data === 'number' ? data : Math.max(cloudBest, pending.score);
      cacheCloudBest(account.id, cloudBest);
      best = Math.max(best, cloudBest);
      onChange('synced');
    } else if (isServerRejection(error)) {
      console.warn('Server did not accept the waiting score:', error);
      writePending(account.id, null);
      cloudBest = await fetchCloudScore(account);
      best = cloudBest;
      onChange('rejected');
    }
    // Any other error is a connection or login problem: keep the score and retry later.
  };

  return {
    load: () => best,
    flush: () => queue.then(() => undefined),
    hasPending: () => readPending(account.id) !== null,
    sync: () => enqueue(syncPending),
    startRun: () => {
      const thisRun = { start: performance.now(), registered: false };
      run = thisRun;
      if (!client) return;
      enqueue(async () => {
        // Send anything waiting FIRST: starting a run counts as contact, which would
        // use up the time the waiting score is checked against.
        try {
          await syncPending();
        } catch (error) {
          console.warn('Could not send the waiting score:', error);
        }
        const { error } = await client.rpc('start_run');
        thisRun.registered = !error;
      });
    },
    save: (score: number) => {
      if (score <= best) return;
      best = score;
      if (!client) return;
      const thisRun = run;
      const seconds = Math.max(1, Math.round((performance.now() - thisRun.start) / 1000));
      enqueue(async () => {
        if (thisRun.registered) {
          const { error } = await client.rpc('submit_score', { p_score: score });
          if (!error) {
            cloudBest = Math.max(cloudBest, score);
            cacheCloudBest(account.id, cloudBest);
            return;
          }
          console.warn('Live save failed, keeping the score to send later:', error);
        }
        // Offline, or the live save failed: keep it on this device and send it when we can.
        const waiting = readPending(account.id);
        if (!waiting || score > waiting.score) writePending(account.id, { score, seconds });
        onChange('pending');
        await syncPending();
      });
    }
  };
}
