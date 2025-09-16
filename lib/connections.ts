import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

const EDGE_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/oauth`;

export async function startProviderConnect(provider: 'github' | 'slack' | 'jira') {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Not signed in');
  const token = data.session.access_token;

  const return_to = `myapp://oauth-complete`; 
  const url =
    `${EDGE_BASE}/${provider}/start` +
    `?access_token=${encodeURIComponent(token)}` +
    `&return_to=${encodeURIComponent(return_to)}`;

  const res = await WebBrowser.openAuthSessionAsync(url);
  if (res.type === 'cancel') throw new Error('User canceled');
}

export async function listMyConnections(): Promise<Record<string, { is_valid: boolean; metadata: any }>> {
  const { data, error } = await supabase.rpc('get_my_connections');
  if (error) throw error;
  const map: Record<string, { is_valid: boolean; metadata: any }> = {};
  (data ?? []).forEach((r: any) => {
    map[r.provider] = { is_valid: !!r.is_valid, metadata: r.metadata };
  });
  return map;
}

export async function disconnectProvider(provider: 'github' | 'slack' | 'jira') {
  const { error } = await supabase.rpc('disconnect_provider', { p_provider: provider });
  if (error) throw error;
}
