import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Modal, Dimensions, RefreshControl, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Plus, Clock, X, Send, Lightbulb, MessageSquare } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams } from 'expo-router';

const { width, height } = Dimensions.get('window');

const timeAgo = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
};

const parseTags = (input: string): string[] =>
  Array.from(new Set((input || '')
    .split(/[, ]+/)
    .map((s) => s.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean)));

const getStatusColor = (status: string) =>
  status === 'open' ? '#ff6b6b' : status === 'helping' ? '#ffaa00' : status === 'resolved' ? '#00ff88' : '#ffffff';

const getSeverityColor = (sev: 'low' | 'medium' | 'high') => (sev === 'high' ? '#ff6b6b' : sev === 'medium' ? '#ffaa00' : '#59d985');

type BlockerRow = {
  id: string;
  pod_id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  status: 'open' | 'helping' | 'resolved';
  created_at: string;
  created_by: string | null;
  helper_user_id: string | null;
};

type HelpReq = {
  id: string;
  pod_id: string;
  blocker_id: string;
  requester_user_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  created_at: string;
};

export default function BlockersScreen() {
  const params = useLocalSearchParams<{ raise?: string }>();

  const [authUid, setAuthUid] = useState<string | null>(null);
  const [podId, setPodId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'helping' | 'resolved'>('all');
  const [q, setQ] = useState('');

  const [composeText, setComposeText] = useState('');
  const [triage, setTriage] = useState<{ severity: 'low' | 'medium' | 'high'; tags: string[]; note: string } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blockerText, setBlockerText] = useState('');
  const [creating, setCreating] = useState(false);

  const rtBlockersRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rtHelpRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [myHelp, setMyHelp] = useState<Record<string, HelpReq['status']>>({});

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        setAuthUid(uid);
        if (!uid) { setLoading(false); return; }

        const { data: pm, error: pmErr } = await supabase
          .from('pod_members')
          .select('pod_id')
          .eq('user_id', uid)
          .order('is_primary', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pmErr) throw pmErr;

        const p = pm?.pod_id ?? null;
        setPodId(p);

        if (p) {
          await loadBlockers(p);
          await loadMyHelpRequests(p, uid);
        } else {
          setBlockers([]);
          setMyHelp({});
        }
      } catch (e: any) {
        console.error('blockers.init', e);
        Alert.alert('Error', e?.message ?? 'Could not load blockers.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (params.raise === '1') setShowCreateModal(true);
  }, [params.raise]);

  useEffect(() => {
    if (!podId) return;
    if (rtBlockersRef.current) { rtBlockersRef.current.unsubscribe(); rtBlockersRef.current = null; }

    const ch = supabase
      .channel(`rt-blockers:${podId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blockers', filter: `pod_id=eq.${podId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as BlockerRow;
          setBlockers((prev) => (prev.some((b) => b.id === row.id) ? prev : [row, ...prev])
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
        } else if (payload.eventType === 'UPDATE') {
          const row = payload.new as BlockerRow;
          setBlockers((prev) => prev.map((b) => (b.id === row.id ? row : b)));
        } else if (payload.eventType === 'DELETE') {
          const row = payload.old as BlockerRow;
          setBlockers((prev) => prev.filter((b) => b.id !== row.id));
        }
      })
      .subscribe();
    rtBlockersRef.current = ch;
    return () => { ch.unsubscribe(); rtBlockersRef.current = null; };
  }, [podId]);

  useEffect(() => {
    if (!podId || !authUid) return;
    if (rtHelpRef.current) { rtHelpRef.current.unsubscribe(); rtHelpRef.current = null; }

    const ch = supabase
      .channel(`rt-bhr:${podId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocker_help_requests', filter: `pod_id=eq.${podId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as HelpReq;
        if (!row || row.requester_user_id !== authUid) return;
        setMyHelp((prev) => {
          const next = { ...prev };
          if (payload.eventType === 'DELETE') {
            delete next[row.blocker_id];
          } else {
            next[row.blocker_id] = (payload.new as HelpReq)?.status ?? prev[row.blocker_id];
          }
          return next;
        });
      })
      .subscribe();
    rtHelpRef.current = ch;
    return () => { ch.unsubscribe(); rtHelpRef.current = null; };
  }, [podId, authUid]);

  const loadBlockers = useCallback(async (p: string) => {
    const { data, error } = await supabase
      .from('blockers')
      .select('id, pod_id, title, description, tags, status, created_at, created_by, helper_user_id')
      .eq('pod_id', p)
      .order('created_at', { ascending: false });
    if (error) throw error;
    setBlockers((data ?? []) as BlockerRow[]);
  }, []);

  const loadMyHelpRequests = useCallback(async (p: string, uid: string) => {
    const { data, error } = await supabase
      .from('blocker_help_requests')
      .select('blocker_id, status')
      .eq('pod_id', p)
      .eq('requester_user_id', uid);
    if (error) throw error;
    const m: Record<string, HelpReq['status']> = {};
    (data ?? []).forEach((r: any) => { m[r.blocker_id] = r.status; });
    setMyHelp(m);
  }, []);

  const onRefresh = useCallback(async () => {
    if (!podId || !authUid) return;
    try {
      setRefreshing(true);
      await Promise.all([loadBlockers(podId), loadMyHelpRequests(podId, authUid)]);
    } catch (e: any) {
      console.error('blockers.refresh', e);
    } finally {
      setRefreshing(false);
    }
  }, [podId, authUid, loadBlockers, loadMyHelpRequests]);

  const runTriage = (text: string) => {
    const lower = text.toLowerCase();
    const severity: 'low' | 'medium' | 'high' =
      lower.includes('crash') || lower.includes('freeze') || lower.includes('fatal') ? 'high'
      : lower.includes('perf') || lower.includes('slow') || lower.includes('lag') ? 'medium'
      : 'low';
    const inferred = [
      lower.includes('redux') && 'redux',
      lower.includes('rtk') && 'rtk-query',
      lower.includes('navigation') && 'navigation',
      lower.includes('expo') && 'expo',
      lower.includes('ios') && 'ios',
      lower.includes('android') && 'android',
      lower.includes('build') && 'build',
      lower.includes('network') && 'network',
    ].filter(Boolean) as string[];
    setTriage({
      severity,
      tags: (inferred.length ? inferred : ['general']).slice(0, 4),
      note:
        severity === 'high'
          ? 'Looks urgent. Add exact error text, repro steps, device/OS, and recent changes.'
          : severity === 'medium'
          ? 'Likely performance/state related. Try profiling, memoization, or cache invalidation.'
          : 'Start with a minimal repro and expected vs actual behavior.',
    });
  };

  const openModalPrefilled = () => { setBlockerText(composeText); setShowCreateModal(true); };

  const handleCreateBlocker = async () => {
    if (!blockerText.trim()) return Alert.alert('Missing details', 'Describe your blocker briefly.');
    if (!podId || !authUid) return Alert.alert('No pod', 'Join or create a pod first.');

    buttonScale.value = withSpring(0.95, { duration: 100 }, () => { buttonScale.value = withSpring(1); });

    try {
      setCreating(true);
      const title = blockerText.split('\n')[0].slice(0, 120) || 'New blocker';
      const description = blockerText.trim();
      const tags = Array.from(new Set([...(triage?.tags ?? []), ...parseTags(description)])).slice(0, 8);

      const { data, error } = await supabase
        .from('blockers')
        .insert([{
          pod_id: podId,
          title,
          description,
          tags,
          status: 'open',
          created_by: authUid,
          user_id: authUid, 
        }])
        .select('id, pod_id, title, description, tags, status, created_at, created_by, helper_user_id')
        .single();
      if (error) throw error;

      setBlockers((prev) => [data as BlockerRow, ...prev]);
      setShowCreateModal(false); setBlockerText(''); setComposeText(''); setTriage(null);
    } catch (e: any) {
      console.error('create blocker', e);
      Alert.alert('Could not create blocker', e?.message ?? 'Unknown error');
    } finally { setCreating(false); }
  };

  const askToHelp = async (blocker: BlockerRow) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blocker_help_requests')
        .insert([{ pod_id: podId, blocker_id: blocker.id, requester_user_id: authUid, status: 'pending' }]);
      if (error && (error as any).code !== '23505') throw error; 
      setMyHelp((m) => ({ ...m, [blocker.id]: 'pending' }));
    } catch (e: any) {
      console.error('askToHelp', e);
      Alert.alert('Could not request', e?.message ?? 'Please try again.');
    }
  };

  const withdrawHelp = async (blocker: BlockerRow) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blocker_help_requests')
        .update({ status: 'withdrawn' })
        .eq('pod_id', podId)
        .eq('blocker_id', blocker.id)
        .eq('requester_user_id', authUid)
        .in('status', ['pending']); 
      if (error) throw error;
      setMyHelp((m) => ({ ...m, [blocker.id]: 'withdrawn' }));
    } catch (e: any) {
      console.error('withdrawHelp', e);
      Alert.alert('Could not withdraw', e?.message ?? 'Please try again.');
    }
  };

  const assignMe = async (blocker: BlockerRow) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blockers')
        .update({ helper_user_id: authUid, status: 'helping' })
        .eq('id', blocker.id)
        .eq('pod_id', podId);
      if (error) throw error;

      await supabase
        .from('blocker_help_requests')
        .update({ status: 'accepted' })
        .eq('pod_id', podId)
        .eq('blocker_id', blocker.id)
        .eq('requester_user_id', authUid)
        .in('status', ['pending']);

      setMyHelp((m) => ({ ...m, [blocker.id]: 'accepted' }));
      setBlockers((prev) => prev.map((b) => (b.id === blocker.id ? { ...b, helper_user_id: authUid, status: 'helping' } : b)));
    } catch (e: any) {
      console.error('assignMe', e);
      Alert.alert('Could not assign', e?.message ?? 'Please try again.');
    }
  };

  const resolve = async (id: string) => {
    if (!podId) return;
    try {
      const { error } = await supabase.from('blockers').update({ status: 'resolved' }).eq('id', id).eq('pod_id', podId);
      if (error) throw error;
      setBlockers((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'resolved' } : b)));
    } catch (e: any) {
      console.error('update resolved', e);
      Alert.alert('Update failed', e?.message ?? 'Could not update blocker.');
    }
  };

  const filtered = useMemo(
    () => blockers.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const blob = (b.title + ' ' + (b.description ?? '') + ' ' + (b.tags ?? []).join(' ')).toLowerCase();
      return blob.includes(q.toLowerCase());
    }),
    [blockers, statusFilter, q]
  );

  const stats = useMemo(() => ({
    open: blockers.filter((b) => b.status === 'open').length,
    helping: blockers.filter((b) => b.status === 'helping').length,
    resolved: blockers.filter((b) => b.status === 'resolved').length,
  }), [blockers]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0a', '#000000']} style={styles.gradient}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.header}>
            <Text style={styles.title}>Blockers</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)} disabled={!podId}>
              <Plus color="#000000" size={20} />
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.statsStrip}>
            <View style={[styles.statChip, { backgroundColor: '#2a1313' }]}><View style={[styles.dot, { backgroundColor: getStatusColor('open') }]} /><Text style={styles.statChipText}>Open {stats.open}</Text></View>
            <View style={[styles.statChip, { backgroundColor: '#211a0c' }]}><View style={[styles.dot, { backgroundColor: getStatusColor('helping') }]} /><Text style={styles.statChipText}>Helping {stats.helping}</Text></View>
            <View style={[styles.statChip, { backgroundColor: '#0f2118' }]}><View style={[styles.dot, { backgroundColor: getStatusColor('resolved') }]} /><Text style={styles.statChipText}>Resolved {stats.resolved}</Text></View>
          </View>

          <BlurView intensity={20} style={styles.composerGlass}>
            <View style={styles.composerRow}>
              <TextInput
                value={composeText}
                onChangeText={(t) => { setComposeText(t); if (t.length > 2) runTriage(t); else setTriage(null); }}
                placeholder={podId ? "What's blocking you? (one line)" : 'Join a pod to raise blockers'}
                placeholderTextColor="#888"
                style={styles.composerInput}
                returnKeyType="send"
                onSubmitEditing={() => (podId ? openModalPrefilled() : null)}
                editable={!!podId}
              />
              <TouchableOpacity style={styles.raiseBtn} onPress={openModalPrefilled} disabled={!podId}><Text style={styles.raiseBtnText}>Raise</Text></TouchableOpacity>
            </View>
            {triage && (
              <View style={styles.triageRow}>
                <View style={[styles.sevPill, { borderColor: getSeverityColor(triage.severity) }]}><Text style={[styles.sevPillText, { color: getSeverityColor(triage.severity) }]}>{triage.severity.toUpperCase()}</Text></View>
                <View style={styles.triageTags}>{triage.tags.slice(0, 3).map((t) => (<View key={t} style={styles.triageTag}><Text style={styles.triageTagText}>{t}</Text></View>))}</View>
                <Text style={styles.triageNote} numberOfLines={2}>{triage.note}</Text>
              </View>
            )}
          </BlurView>

          {!loading && filtered.length === 0 && (
            <Text style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>
              {podId ? 'No blockers yet.' : 'Join or create a pod to see blockers.'}
            </Text>
          )}

          {filtered.map((b, i) => {
            const myReq = myHelp[b.id]; 
            const iAmHelper = authUid && b.helper_user_id === authUid;
            const canAsk = b.status !== 'resolved' && !iAmHelper && myReq !== 'pending' && myReq !== 'accepted';

            return (
              <Animated.View key={b.id} entering={FadeInDown.delay(300 + i * 100).springify()} style={styles.cardContainer}>
                <BlurView intensity={20} style={styles.cardGlass}>
                  <View style={styles.blockerCard}>
                    <View style={styles.blockerHeader}>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(b.status) }]} />
                        <Text style={styles.statusText}>
                          {b.status === 'open' && 'Open'}
                          {b.status === 'helping' && 'Being helped'}
                          {b.status === 'resolved' && 'Resolved'}
                          {iAmHelper && ' • You'}
                        </Text>
                      </View>
                      <View style={styles.timeRow}>
                        <Clock color="#666666" size={14} />
                        <Text style={styles.timestamp}>{timeAgo(b.created_at)}</Text>
                      </View>
                    </View>

                    <Text style={styles.blockerTitle}>{b.title}</Text>
                    {!!b.description && <Text style={styles.blockerDescription}>{b.description}</Text>}

                    {b.status === 'open' && (
                      <View style={styles.aiHint}>
                        <Lightbulb size={14} color="#ffd966" />
                        <Text style={styles.aiHintText}>Tip: Add a minimal repro and expected/actual behavior to speed up help.</Text>
                      </View>
                    )}

                    <View style={styles.tagsContainer}>
                      {(b.tags ?? []).map((tag, idx) => (
                        <View key={`${b.id}-${tag}-${idx}`} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>
                      ))}
                    </View>

                    <View style={styles.cardFooter}>
                      {iAmHelper ? (
                        <View style={styles.footerBtnPrimary}><MessageSquare size={16} color="#000" /><Text style={styles.footerBtnPrimaryText}>You’re helping</Text></View>
                      ) : canAsk ? (
                        <TouchableOpacity style={styles.footerBtnPrimary} onPress={() => askToHelp(b)}>
                          <MessageSquare size={16} color="#000" /><Text style={styles.footerBtnPrimaryText}>Ask to help</Text>
                        </TouchableOpacity>
                      ) : myReq === 'pending' ? (
                        <TouchableOpacity style={styles.footerBtnPrimary} onPress={() => withdrawHelp(b)}>
                          <MessageSquare size={16} color="#000" /><Text style={styles.footerBtnPrimaryText}>Requested (tap to withdraw)</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.footerBtnPrimary, { opacity: 0.65 }]}><MessageSquare size={16} color="#000" /><Text style={styles.footerBtnPrimaryText}>Ask to help</Text></View>
                      )}

                      {b.status !== 'helping' && b.status !== 'resolved' && (
                        <TouchableOpacity style={styles.footerBtnSecondary} onPress={() => assignMe(b)}>
                          <Text style={styles.footerBtnSecondaryText}>Assign me</Text>
                        </TouchableOpacity>
                      )}

                      {b.status !== 'resolved' && (
                        <TouchableOpacity style={styles.footerBtnDanger} onPress={() => resolve(b.id)}>
                          <Text style={styles.footerBtnDangerText}>Resolve</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </BlurView>
              </Animated.View>
            );
          })}
        </ScrollView>

        <Modal visible={showCreateModal} transparent animationType="none" onRequestClose={() => setShowCreateModal(false)}>
          <BlurView intensity={40} style={styles.modalOverlay}>
            <Animated.View entering={FadeInUp.springify()} style={styles.modalContainer}>
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}><Lightbulb color="#ffffff" size={20} /><Text style={styles.modalTitle}>Describe Your Blocker</Text></View>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setShowCreateModal(false)}><X color="#ffffff" size={20} /></TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.blockerInput}
                    placeholder="What's blocking you? Be specific about the tech stack, error messages, or concept…"
                    placeholderTextColor="#666666"
                    value={blockerText}
                    onChangeText={(t) => { setBlockerText(t); if (t.length > 2) runTriage(t); else setTriage(null); }}
                    multiline numberOfLines={6} textAlignVertical="top" editable={!creating}
                  />

                  {triage && (
                    <View style={[styles.aiHint, { marginTop: 0, marginBottom: 16 }]}>
                      <Lightbulb size={14} color="#ffd966" /><Text style={styles.aiHintText}>{triage.note}</Text>
                    </View>
                  )}

                  <Animated.View style={buttonAnimatedStyle}>
                    <TouchableOpacity style={[styles.createButton, creating && { opacity: 0.85 }]} onPress={handleCreateBlocker} activeOpacity={0.8} disabled={creating}>
                      <Send color="#000000" size={18} /><Text style={styles.createButtonText}>{creating ? 'Creating…' : 'Find Helpers'}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </BlurView>
            </Animated.View>
          </BlurView>
        </Modal>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, gradient: { flex: 1 }, scrollView: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  statsStrip: { flexDirection: 'row', gap: 8 as any, marginBottom: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6 as any, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  statChipText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 12 }, dot: { width: 8, height: 8, borderRadius: 4 },
  composerGlass: { borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 12, marginBottom: 14 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 as any },
  composerInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, color: '#fff', fontFamily: 'Inter-Regular' },
  raiseBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#ffffff' },
  raiseBtnText: { color: '#000', fontWeight: '700' },
  triageRow: { marginTop: 10 },
  sevPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginBottom: 8 },
  sevPillText: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.4 },
  triageTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any, marginBottom: 6 },
  triageTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  triageTagText: { color: '#ddd', fontSize: 10 },
  triageNote: { color: '#cfcfcf', fontSize: 12, lineHeight: 18 },
  cardContainer: { marginBottom: 20 },
  cardGlass: { borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  blockerCard: { padding: 20 },
  blockerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#ffffff' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timestamp: { fontSize: 12, fontFamily: 'Inter-Regular', color: '#666666', marginLeft: 4 },
  blockerTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 8 },
  blockerDescription: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#cccccc', lineHeight: 20, marginBottom: 12 },
  aiHint: { flexDirection: 'row', gap: 8 as any, alignItems: 'flex-start', backgroundColor: 'rgba(255,217,102,0.08)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,217,102,0.25)', marginBottom: 12 },
  aiHintText: { color: '#f5f0dc', flex: 1, fontSize: 12, lineHeight: 18 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  tag: { backgroundColor: 'rgba(255, 255, 255, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8, marginBottom: 4 },
  tagText: { fontSize: 10, fontFamily: 'Inter-Medium', color: '#ffffff' },
  cardFooter: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', gap: 8 as any },
  footerBtnPrimary: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 as any },
  footerBtnPrimaryText: { color: '#000', fontWeight: '700' },
  footerBtnSecondary: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  footerBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  footerBtnDanger: { flexBasis: 96, borderRadius: 12, backgroundColor: '#ffdbdb', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  footerBtnDangerText: { color: '#111', fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContainer: { width: width - 40, maxHeight: height * 0.8 },
  modalGlass: { borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(0, 0, 0, 0.8)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  modal: { padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginLeft: 8 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center' },
  blockerInput: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 16, padding: 16, fontSize: 16, fontFamily: 'Inter-Regular', color: '#ffffff', minHeight: 120, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  createButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24 },
  createButtonText: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#000000', marginLeft: 8 },
});
