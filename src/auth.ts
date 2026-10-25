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
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) return { ok: false, error: error.message };
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

async function saveCloudScore(account: Account, score: number): Promise<void> {
  if (!client) return;
  try {
    const { error } = await client.from('scores').upsert({
      user_id: account.id,
      username: account.username,
      high_score: score
    });
    if (error) throw error;
  } catch (error) {
    console.warn('Could not save score:', error);
  }
}

// Score store backed by the player's account; `initial` is their saved best.
export function createCloudScoreStore(account: Account, initial: number): ScoreStore {
  let best = initial;
  return {
    load: () => best,
    save: (score: number) => {
      if (score <= best) return;
      best = score;
      void saveCloudScore(account, score);
    }
  };
}
