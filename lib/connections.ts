import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

type Provider = 'github' | 'slack' | 'jira';

type ConnMap = Record<
  string,
  {
    is_valid: boolean;
    metadata: any;
  }
>;

function baseUrl() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
  return url.replace(/\/+$/, '');
}

export async function listMyConnections(): Promise<ConnMap> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('external_connections')
    .select('provider, expires_at, metadata')
    .eq('user_id', user.id);

  if (error) throw error;

  const now = Math.floor(Date.now() / 1000);
  const map: ConnMap = {};

  for (const row of (data ?? []) as any[]) {
    const exp = typeof row.expires_at === 'number' ? row.expires_at : null;
    const valid = exp ? exp > now : true; 
    map[row.provider] = { is_valid: !!valid, metadata: row.metadata ?? null };
  }
  return map;
}

export async function disconnectProvider(provider: Provider) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('external_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider);

  if (error) throw error;
}

export async function startProviderConnect(provider: Provider) {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) throw new Error('Not signed in');

  const returnTo = Linking.createURL('oauth-complete');

  const startUrl =
    `${baseUrl()}/functions/v1/oauth/${provider}/start` +
    `?access_token=${encodeURIComponent(jwt)}` +
    `&return_to=${encodeURIComponent(returnTo)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);
  return result; 
}
