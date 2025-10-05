import { supabase } from '@/lib/supabase';

type GetTokenArgs = {
  room: string;  
  displayName?: string; 
};

export async function getLiveKitToken({ room, displayName }: GetTokenArgs) {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: { room, displayName },
  });

  if (error) {
    throw new Error(error.message || 'livekit-token failed');
  }

  return data as {
    token: string;
    url: string;
    host_user_id?: string | null;
    host_display_name?: string | null;
  };
}
