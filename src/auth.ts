import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScoreStore } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Without the env vars the game still works as guest-only.
export const authEnabled = Boolean(url && key);
const client: SupabaseClient | null = authEnabled ? createClient(url!, key!) : null;

// Date of the privacy policy the sign-up checkbox points to (src/privacy.html). Change it
// whenever the policy changes in a way players should agree to again.
export const PRIVACY_POLICY_DATE = '2026-11-01';

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

// A failed request that never reached the server (no internet, DNS, blocked, timed out).
function isNetworkError(message: string): boolean {
  return /failed to fetch|network|load failed|fetch failed|abort|timed out/i.test(message);
}

const SLOW_MESSAGE = 'This is taking too long. Check your connection and try again.';
const REQUEST_TIMEOUT_MS = 8000;
const TIMED_OUT = Symbol('timed out');

// Weak or captive Wi-Fi can leave a request hanging for minutes. Every server call is
// cut off after a few seconds, so one stuck call can't freeze the queue or a screen.
function timeoutSignal(ms = REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// For calls that can't take an abort signal (login): stop waiting after `ms`.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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
    const result = await withTimeout(client.auth.getSession(), 4000);
    // Too slow to answer (weak connection): trust the saved login instead of waiting.
    if (result === TIMED_OUT) return readStoredAccount();
    if (result.data.session) return toAccount(result.data.session.user);
    // No session because the token could not be refreshed over the network: still logged in.
    if (result.error && isNetworkError(result.error.message)) return readStoredAccount();
  } catch {
    return readStoredAccount();
  }
  return isOffline() ? readStoredAccount() : null;
}

export async function signUp(username: string, email: string, password: string): Promise<AuthResult> {
  if (!client) return { ok: false, error: 'Accounts are not set up.' };
  if (isOffline()) return { ok: false, error: OFFLINE_MESSAGE };

  // Usernames are unique; check first so the player gets a clear message.
  const { data: available, error: checkError } = await client
    .rpc('username_available', { p_name: username })
    .abortSignal(timeoutSignal());
  if (checkError) {
    return { ok: false, error: isNetworkError(checkError.message) ? OFFLINE_MESSAGE : 'Could not check that username. Try again.' };
  }
  if (available !== true) return { ok: false, error: 'That username is taken or not allowed.' };

  const response = await withTimeout(
    // privacy_accepted records which version of the policy the player agreed to.
    client.auth.signUp({ email, password, options: { data: { username, privacy_accepted: PRIVACY_POLICY_DATE } } }),
    15000
  );
  if (response === TIMED_OUT) return { ok: false, error: SLOW_MESSAGE };
  const { data, error } = response;
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
  const response = await withTimeout(client.auth.signInWithPassword({ email, password }), 15000);
  if (response === TIMED_OUT) return { ok: false, error: SLOW_MESSAGE };
  const { data, error } = response;
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

// Last best the server reported for this account (instant, works offline).
export function getCachedCloudScore(account: Account): number {
  return readCachedCloudBest(account.id);
}

export async function fetchCloudScore(account: Account): Promise<number> {
  if (!client) return 0;
  try {
    const { data, error } = await client
      .from('scores')
      .select('high_score')
      .eq('user_id', account.id)
      .abortSignal(timeoutSignal())
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
      .limit(limit)
      .abortSignal(timeoutSignal());
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
      .gt('high_score', score)
      .abortSignal(timeoutSignal());
    if (error) throw error;
    return (count ?? 0) + 1;
  } catch (error) {
    console.warn('Could not load rank:', error);
    return null;
  }
}

// Permanently erases the signed-in player's account on the server (the database function
// also removes their score and run records), then clears what this device kept for them.
export async function deleteAccount(account: Account): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!client) return { ok: false, error: 'Accounts are not set up.' };
  if (isOffline()) return { ok: false, error: 'You need to be online to delete your account.' };

  const { error } = await client.rpc('delete_my_account').abortSignal(timeoutSignal(15000));
  if (error) {
    return {
      ok: false,
      error: isNetworkError(error.message) ? SLOW_MESSAGE : 'Could not delete the account. Try again in a moment.'
    };
  }

  writePending(account.id, null);
  try {
    localStorage.removeItem(cloudBestKey(account.id));
  } catch {
    // Storage blocked: nothing was saved there anyway.
  }
  await signOut(); // the login is already invalid; this just clears it from the device
  return { ok: true };
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

// Returns false if the browser would not let us save (private mode, storage full).
function writePending(id: string, pending: PendingScore | null): boolean {
  try {
    if (pending) localStorage.setItem(pendingKey(id), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(id));
    return true;
  } catch {
    return false;
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

// The server said no (a database "raise exception"), as opposed to a connection problem.
function isServerRejection(error: unknown): boolean {
  return errorCode(error) === 'P0001';
}

// The server said "not yet": the claimed run is longer than the time since it last heard
// from this player (for example another device just checked in). Keep the score and try
// again later, when enough time has passed.
function isTooSoon(error: unknown): boolean {
  return errorCode(error) === 'VR001';
}

// Score store backed by the player's account; `initial` is their saved best.
// Calls go out one at a time, so "start run" can never overtake the previous "submit".
// Offline: the new best is kept on the device and sent when the network is back.
export function createCloudScoreStore(
  account: Account,
  initial: number,
  onChange: (event: SyncEvent) => void = () => {}
): ScoreStore {
  // If the browser won't let us save to storage, the waiting score is kept in memory.
  let memoryPending: PendingScore | null = null;
  const getPending = (): PendingScore | null => readPending(account.id) ?? memoryPending;
  const setPending = (pending: PendingScore | null): void => {
    memoryPending = writePending(account.id, pending) ? null : pending;
  };

  let cloudBest = initial;
  let best = Math.max(initial, getPending()?.score ?? 0);
  // Each run remembers whether the server knows about it (start_run worked).
  let run = { start: performance.now(), registered: false };
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task).catch((error) => console.warn('Cloud task failed:', error));
  };

  // Send a waiting score. Safe to call any time; it does nothing offline or with nothing waiting.
  const syncPending = async (): Promise<void> => {
    const pending = getPending();
    if (!pending || !client || isOffline()) return;

    const { data, error } = await client
      .rpc('submit_offline_score', { p_score: pending.score, p_seconds: pending.seconds })
      .abortSignal(timeoutSignal());
    if (!error) {
      setPending(null);
      cloudBest = typeof data === 'number' ? data : Math.max(cloudBest, pending.score);
      cacheCloudBest(account.id, cloudBest);
      best = Math.max(best, cloudBest);
      onChange('synced');
    } else if (isServerRejection(error)) {
      console.warn('Server did not accept the waiting score:', error);
      setPending(null);
      cloudBest = await fetchCloudScore(account);
      best = cloudBest;
      onChange('rejected');
    } else if (isTooSoon(error)) {
      console.warn('Waiting score is too soon to check; will try again later:', error);
    }
    // Any other error is a connection or login problem: keep the score and retry later.
  };

  return {
    load: () => best,
    flush: () => queue.then(() => undefined),
    hasPending: () => getPending() !== null,
    sync: () => enqueue(syncPending),
    // Update the best from the server in the background (never blocks the screen).
    refresh: async () => {
      const fromServer = await fetchCloudScore(account);
      cloudBest = Math.max(cloudBest, fromServer);
      best = Math.max(best, cloudBest, getPending()?.score ?? 0);
    },
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
        const { error } = await client.rpc('start_run').abortSignal(timeoutSignal());
        thisRun.registered = !error;
      });
    },
    save: (score: number) => {
      if (score <= best) return;
      best = score;
      if (!client) return;
      const thisRun = run;
      // Whole run length (pauses included, which only ever makes it longer). The server
      // refuses anything over a day, so cap it (a laptop asleep mid-run).
      const seconds = Math.min(86400, Math.max(1, Math.round((performance.now() - thisRun.start) / 1000)));
      enqueue(async () => {
        if (thisRun.registered) {
          const { error } = await client.rpc('submit_score', { p_score: score }).abortSignal(timeoutSignal());
          if (!error) {
            cloudBest = Math.max(cloudBest, score);
            cacheCloudBest(account.id, cloudBest);
            return;
          }
          console.warn('Live save failed, keeping the score to send later:', error);
        }
        // Offline, or the live save failed: keep it on this device and send it when we can.
        const waiting = getPending();
        if (!waiting || score > waiting.score) setPending({ score, seconds });
        onChange('pending');
        await syncPending();
      });
    }
  };
}
