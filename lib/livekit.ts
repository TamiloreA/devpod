// lib/livekit.ts
import { supabase } from '@/lib/supabase';

type GetTokenArgs = { room: string; displayName?: string };

export async function getLiveKitToken({ room, displayName }: GetTokenArgs) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');

  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: { room, displayName },
    headers: { Authorization: `Bearer ${session.access_token}` }, // ← important
  });

  if (error) throw new Error(error.message || 'livekit-token failed');
  return data as { token: string; url: string };
}
