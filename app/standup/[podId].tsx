import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import StandupRoom from '@/components/StandupRoom';

export default function StandupScreen() {
  const { podId } = useLocalSearchParams<{ podId: string }>();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: string; display_name: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id ?? null;
      setUid(id);
      if (!id) return;
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', id)
        .maybeSingle();
      setProfile(prof ?? null);
    })();
  }, []);

  if (!podId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>Missing podId</Text>
      </View>
    );
  }

  if (!uid) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <StandupRoom
      podId={String(podId)}
      selfId={uid}
      selfName={profile?.display_name ?? 'You'}
      onLeave={() => router.back()}
    />
  );
}
