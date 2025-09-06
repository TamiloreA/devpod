import * as React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';

type InviteRow = {
  pod_id: string;
  code: string;
  expires_at: string;
  max_uses: number | null;
  used_count: number | null;
  pods?: { name?: string | null } | null;
};

export default function JoinWithCodeScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [podName, setPodName] = React.useState<string>('Pod');
  const [msg, setMsg] = React.useState<string>('Checking invite…');

  React.useEffect(() => {
    const c = (Array.isArray(code) ? code[0] : code) ?? '';
    if (!c.trim()) {
      setState('error');
      setMsg('Missing invite code.');
      return;
    }
    accept(c.trim()).catch((e) => {
      console.error(e);
      setState('error');
      setMsg(e?.message ?? 'Could not join with this invite.');
    });
  }, [code]);

  const accept = async (c: string) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setState('error');
      setMsg('Please sign in to use an invite.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('accept_pod_invite', { p_code: c });
      if (!error && data && (data as any).pod_id) {
        setPodName((data as any).pod_name ?? 'Your Pod');
        setState('ok');
        setMsg('You joined successfully.');
        setTimeout(() => router.replace('/(tabs)/pods'), 650);
        return;
      }
      if (error && error.message?.includes('function accept_pod_invite')) {
      } else if (error) {
        throw error;
      }
    } catch (e) {
      console.log('RPC not available, falling back to client method.');
    }

    setMsg('Validating invite…');
    const { data: rows, error: selErr } = await supabase
      .from('pod_invites')
      .select('pod_id, code, expires_at, max_uses, used_count, pods(name)')
      .eq('code', c)
      .maybeSingle<InviteRow>();
    if (selErr) throw selErr;
    if (!rows) throw new Error('Invite not found.');

    setPodName(rows.pods?.name ?? 'Your Pod');

    const now = Date.now();
    const exp = new Date(rows.expires_at).getTime();
    if (Number.isFinite(exp) && now > exp) throw new Error('This invite has expired.');
    if (rows.max_uses != null && rows.used_count != null && rows.used_count >= rows.max_uses) {
      throw new Error('This invite has reached its maximum uses.');
    }

    const { data: already } = await supabase
      .from('pod_members')
      .select('id')
      .eq('pod_id', rows.pod_id)
      .eq('user_id', auth.user.id)
      .limit(1);
    if ((already?.length ?? 0) > 0) {
      setState('ok');
      setMsg('You are already a member.');
      setTimeout(() => router.replace('/(tabs)/pods'), 650);
      return;
    }

    const { error: insErr } = await supabase
      .from('pod_members')
      .insert([{ pod_id: rows.pod_id, user_id: auth.user.id, role: 'member', is_primary: true }]);
    if (insErr) throw insErr;

    await supabase
      .from('pod_invites')
      .update({ used_count: (rows.used_count ?? 0) + 1 })
      .eq('code', c)
      .select('code')
      .maybeSingle();

    setState('ok');
    setMsg('You joined successfully.');
    setTimeout(() => router.replace('/(tabs)/pods'), 650);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0b0b0b', '#000000']} style={StyleSheet.absoluteFill} />
      <View style={styles.wrap}>
        <BlurView intensity={20} style={styles.card}>
          <Text style={styles.title}>{state === 'ok' ? `Welcome to ${podName}` : 'Join Pod'}</Text>
          <Text style={styles.sub}>{msg}</Text>

          {state === 'loading' && <ActivityIndicator style={{ marginTop: 14 }} />}

          {state === 'ok' && (
            <Pressable style={styles.cta} onPress={() => router.replace('/(tabs)/pods')}>
              <Text style={styles.ctaText}>Open Pod</Text>
            </Pressable>
          )}

          {state === 'error' && (
            <Pressable
              style={[styles.cta, { backgroundColor: '#ffffff15', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1 }]}
              onPress={() => router.replace('/')}
            >
              <Text style={[styles.ctaText, { color: '#fff' }]}>Go Home</Text>
            </Pressable>
          )}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  wrap: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
  },
  title: { color: '#fff', fontSize: 20, fontFamily: 'Inter-SemiBold', marginBottom: 8 },
  sub: { color: '#bdbdbd' },
  cta: {
    marginTop: 16,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaText: { color: '#000', fontWeight: '800' },
});
