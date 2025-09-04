import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Dimensions,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInUp,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
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

const parseTags = (input: string): string[] => {
  if (!input?.trim()) return [];
  const parts = input
    .split(/[, ]+/)
    .map((s) => s.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(parts));
};

const getLevelColor = (level: string) => {
  switch (level) {
    case 'Senior': return '#00ff88';
    case 'Mid': return '#ffaa00';
    case 'Junior': return '#6699ff';
    default: return '#ffffff';
  }
};
const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return '#ff6b6b';
    case 'helping': return '#ffaa00';
    case 'resolved': return '#00ff88';
    default: return '#ffffff';
  }
};
const getSeverityColor = (sev: 'low' | 'medium' | 'high') => {
  if (sev === 'high') return '#ff6b6b';
  if (sev === 'medium') return '#ffaa00';
  return '#59d985';
};

type BlockerRow = {
  id: string;
  pod_id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  status: 'open' | 'helping' | 'resolved';
  created_at: string;
};

export default function BlockersScreen() {
  const params = useLocalSearchParams<{ raise?: string }>(); 

  const [podId, setPodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'helping' | 'resolved'>('all');
  const [q, setQ] = useState('');

  const [composeText, setComposeText] = useState('');
  const [triage, setTriage] = useState<{
    severity: 'low' | 'medium' | 'high';
    tags: string[];
    note: string;
  } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blockerText, setBlockerText] = useState('');
  const [creating, setCreating] = useState(false);

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          setLoading(false);
          return;
        }

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
        } else {
          setBlockers([]);
        }
      } catch (e: any) {
        console.error('blockers.load init', e);
        Alert.alert('Error', e?.message ?? 'Could not load blockers.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (params.raise === '1') {
      setShowCreateModal(true);
    }
  }, [params.raise]); 

  const loadBlockers = useCallback(async (p: string) => {
    const { data, error } = await supabase
      .from('blockers')
      .select('id, pod_id, title, description, tags, status, created_at')
      .eq('pod_id', p)
      .order('created_at', { ascending: false });
    if (error) throw error;
    setBlockers((data ?? []) as BlockerRow[]);
  }, []);

  const onRefresh = useCallback(async () => {
    if (!podId) return;
    try {
      setRefreshing(true);
      await loadBlockers(podId);
    } catch (e: any) {
      console.error('blockers.refresh', e);
    } finally {
      setRefreshing(false);
    }
  }, [podId, loadBlockers]);

  const runTriage = (text: string) => {
    const lower = text.toLowerCase();
    const severity: 'low' | 'medium' | 'high' =
      lower.includes('crash') || lower.includes('freeze')
        ? 'high'
        : lower.includes('perf') || lower.includes('slow')
        ? 'medium'
        : 'low';
    const tags = [
      lower.includes('redux') && 'redux',
      lower.includes('rtk') && 'rtk-query',
      lower.includes('navigation') && 'navigation',
      lower.includes('expo') && 'expo',
      lower.includes('ios') && 'ios',
      lower.includes('android') && 'android',
    ].filter(Boolean) as string[];
    setTriage({
      severity,
      tags: tags.length ? tags : ['general'],
      note:
        severity === 'high'
          ? 'Looks urgent. Capture a minimal repro and a performance trace if possible.'
          : severity === 'medium'
          ? 'Might be caching/state related. Try invalidation or memoization checks.'
          : 'Start with a minimal repro and confirm expected behavior.',
    });
  };

  const openModalPrefilled = () => {
    setBlockerText(composeText);
    setShowCreateModal(true);
  };

  const handleCreateBlocker = async () => {
    if (!blockerText.trim()) {
      Alert.alert('Missing details', 'Describe your blocker briefly.');
      return;
    }
    if (!podId) {
      Alert.alert('No pod', 'Join or create a pod first.');
      return;
    }

    buttonScale.value = withSpring(0.95, { duration: 100 }, () => {
      buttonScale.value = withSpring(1);
    });

    try {
      setCreating(true);
      const title = blockerText.split('\n')[0].slice(0, 120) || 'New blocker';
      const description = blockerText.trim();
      const inferred = (triage?.tags ?? []).map((t) => t.toLowerCase());
      const tags = Array.from(new Set(inferred));

      const { data, error } = await supabase
        .from('blockers')
        .insert([{ pod_id: podId, title, description, tags, status: 'open' }])
        .select('id, pod_id, title, description, tags, status, created_at')
        .single();

      if (error) throw error;

      setBlockers((prev) => [data as BlockerRow, ...prev]);

      setShowCreateModal(false);
      setBlockerText('');
      setComposeText('');
      setTriage(null);
    } catch (e: any) {
      console.error('create blocker', e);
      Alert.alert('Could not create blocker', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const markHelping = async (id: string) => {
    try {
      const { error } = await supabase.from('blockers').update({ status: 'helping' }).eq('id', id);
      if (error) throw error;
      setBlockers((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'helping' } : b)));
    } catch (e: any) {
      console.error('update helping', e);
      Alert.alert('Update failed', e?.message ?? 'Could not update blocker.');
    }
  };

  const resolve = async (id: string) => {
    try {
      const { error } = await supabase.from('blockers').update({ status: 'resolved' }).eq('id', id);
      if (error) throw error;
      setBlockers((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'resolved' } : b)));
    } catch (e: any) {
      console.error('update resolved', e);
      Alert.alert('Update failed', e?.message ?? 'Could not update blocker.');
    }
  };

  const filtered = useMemo(
    () =>
      blockers.filter((b) => {
        if (statusFilter !== 'all' && b.status !== statusFilter) return false;
        if (!q.trim()) return true;
        const blob = (b.title + ' ' + (b.description ?? '') + ' ' + (b.tags ?? []).join(' ')).toLowerCase();
        return blob.includes(q.toLowerCase());
      }),
    [blockers, statusFilter, q]
  );

  const stats = useMemo(() => {
    const open = blockers.filter((b) => b.status === 'open').length;
    const helping = blockers.filter((b) => b.status === 'helping').length;
    const resolved = blockers.filter((b) => b.status === 'resolved').length;
    return { open, helping, resolved };
  }, [blockers]);

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
            <View style={[styles.statChip, { backgroundColor: '#2a1313' }]}>
              <View style={[styles.dot, { backgroundColor: getStatusColor('open') }]} />
              <Text style={styles.statChipText}>Open {stats.open}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#211a0c' }]}>
              <View style={[styles.dot, { backgroundColor: getStatusColor('helping') }]} />
              <Text style={styles.statChipText}>Helping {stats.helping}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#0f2118' }]}>
              <View style={[styles.dot, { backgroundColor: getStatusColor('resolved') }]} />
              <Text style={styles.statChipText}>Resolved {stats.resolved}</Text>
            </View>
          </View>

          <BlurView intensity={20} style={styles.composerGlass}>
            <View style={styles.composerRow}>
              <TextInput
                value={composeText}
                onChangeText={(t) => {
                  setComposeText(t);
                  if (t.length > 2) runTriage(t);
                  else setTriage(null);
                }}
                placeholder={podId ? "What's blocking you? (one line)" : 'Join a pod to raise blockers'}
                placeholderTextColor="#888"
                style={styles.composerInput}
                returnKeyType="send"
                onSubmitEditing={() => (podId ? openModalPrefilled() : null)}
                editable={!!podId}
              />
              <TouchableOpacity style={styles.raiseBtn} onPress={openModalPrefilled} disabled={!podId}>
                <Text style={styles.raiseBtnText}>Raise</Text>
              </TouchableOpacity>
            </View>

            {triage && (
              <View style={styles.triageRow}>
                <View style={[styles.sevPill, { borderColor: getSeverityColor(triage.severity) }]}>
                  <Text style={[styles.sevPillText, { color: getSeverityColor(triage.severity) }]}>
                    {triage.severity.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.triageTags}>
                  {triage.tags.slice(0, 3).map((t) => (
                    <View key={t} style={styles.triageTag}>
                      <Text style={styles.triageTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.triageNote} numberOfLines={2}>
                  {triage.note}
                </Text>
              </View>
            )}
          </BlurView>

          <View style={styles.filterBar}>
            {(['all', 'open', 'helping', 'resolved'] as const).map((s) => (
              <TouchableOpacity key={s} onPress={() => setStatusFilter(s)} style={[styles.seg, statusFilter === s && styles.segActive]}>
                <Text style={[styles.segText, statusFilter === s && styles.segTextActive]}>{s[0].toUpperCase() + s.slice(1)}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search"
              placeholderTextColor="#888"
              style={styles.search}
            />
          </View>

          {!loading && filtered.length === 0 && (
            <Text style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>
              {podId ? 'No blockers yet.' : 'Join or create a pod to see blockers.'}
            </Text>
          )}

          {filtered.map((blocker, index) => (
            <Animated.View key={blocker.id} entering={FadeInDown.delay(300 + index * 100).springify()} style={styles.cardContainer}>
              <BlurView intensity={20} style={styles.cardGlass}>
                <View style={styles.blockerCard}>
                  <View style={styles.blockerHeader}>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(blocker.status) }]} />
                      <Text style={styles.statusText}>
                        {blocker.status === 'open' && 'Open'}
                        {blocker.status === 'helping' && 'Being helped'}
                        {blocker.status === 'resolved' && 'Resolved'}
                      </Text>
                    </View>
                    <View style={styles.timeRow}>
                      <Clock color="#666666" size={14} />
                      <Text style={styles.timestamp}>{timeAgo(blocker.created_at)}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow} />

                  <Text style={styles.blockerTitle}>{blocker.title}</Text>
                  {!!blocker.description && <Text style={styles.blockerDescription}>{blocker.description}</Text>}

                  {blocker.status === 'open' && (
                    <View style={styles.aiHint}>
                      <Lightbulb size={14} color="#ffd966" />
                      <Text style={styles.aiHintText}>
                        Tip: Add a minimal repro and expected/actual behavior to speed up help.
                      </Text>
                    </View>
                  )}

                  <View style={styles.tagsContainer}>
                    {(blocker.tags ?? []).map((tag, tagIndex) => (
                      <View key={`${blocker.id}-${tag}-${tagIndex}`} style={styles.tag}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.cardFooter}>
                    <TouchableOpacity style={styles.footerBtnPrimary}>
                      <MessageSquare size={16} color="#000" />
                      <Text style={styles.footerBtnPrimaryText}>Ask to help</Text>
                    </TouchableOpacity>
                    {blocker.status !== 'helping' && blocker.status !== 'resolved' && (
                      <TouchableOpacity style={styles.footerBtnSecondary} onPress={() => markHelping(blocker.id)}>
                        <Text style={styles.footerBtnSecondaryText}>Mark helping</Text>
                      </TouchableOpacity>
                    )}
                    {blocker.status !== 'resolved' && (
                      <TouchableOpacity style={styles.footerBtnDanger} onPress={() => resolve(blocker.id)}>
                        <Text style={styles.footerBtnDangerText}>Resolve</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </BlurView>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Create modal */}
        <Modal visible={showCreateModal} transparent animationType="none" onRequestClose={() => setShowCreateModal(false)}>
          <BlurView intensity={40} style={styles.modalOverlay}>
            <Animated.View entering={FadeInUp.springify()} style={styles.modalContainer}>
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Lightbulb color="#ffffff" size={20} />
                      <Text style={styles.modalTitle}>Describe Your Blocker</Text>
                    </View>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setShowCreateModal(false)}>
                      <X color="#ffffff" size={20} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.blockerInput}
                    placeholder="What's blocking you? Be specific about the tech stack, error messages, or concept…"
                    placeholderTextColor="#666666"
                    value={blockerText}
                    onChangeText={(t) => {
                      setBlockerText(t);
                      if (t.length > 2) runTriage(t);
                      else setTriage(null);
                    }}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    editable={!creating}
                  />

                  {triage && (
                    <View style={[styles.aiHint, { marginTop: 0, marginBottom: 16 }]}>
                      <Lightbulb size={14} color="#ffd966" />
                      <Text style={styles.aiHintText}>{triage.note}</Text>
                    </View>
                  )}

                  <Animated.View style={buttonAnimatedStyle}>
                    <TouchableOpacity
                      style={[styles.createButton, creating && { opacity: 0.85 }]}
                      onPress={handleCreateBlocker}
                      activeOpacity={0.8}
                      disabled={creating}
                    >
                      <Send color="#000000" size={18} />
                      <Text style={styles.createButtonText}>{creating ? 'Creating…' : 'Find Helpers'}</Text>
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
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 120 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },

  statsStrip: { flexDirection: 'row', gap: 8 as any, marginBottom: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6 as any, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  statChipText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },

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

  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8 as any, marginBottom: 12 },
  seg: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  segActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  segText: { color: '#bbb', fontFamily: 'Inter-Medium', fontSize: 12 },
  segTextActive: { color: '#fff' },
  search: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', color: '#fff', minWidth: 110 },

  cardContainer: { marginBottom: 20 },
  cardGlass: { borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  blockerCard: { padding: 20 },
  blockerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#ffffff' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timestamp: { fontSize: 12, fontFamily: 'Inter-Regular', color: '#666666', marginLeft: 4 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 as any, marginBottom: 8 },
  fileChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  fileChipText: { color: '#ddd', fontSize: 10 },

  blockerTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 8 },
  blockerDescription: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#cccccc', lineHeight: 20, marginBottom: 12 },

  aiHint: { flexDirection: 'row', gap: 8 as any, alignItems: 'flex-start', backgroundColor: 'rgba(255,217,102,0.08)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,217,102,0.25)', marginBottom: 12 },
  aiHintText: { color: '#f5f0dc', flex: 1, fontSize: 12, lineHeight: 18 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  tag: { backgroundColor: 'rgba(255, 255, 255, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8, marginBottom: 4 },
  tagText: { fontSize: 10, fontFamily: 'Inter-Medium', color: '#ffffff' },

  helpersSection: { borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.1)', paddingTop: 16 },
  helpersTitle: { fontSize: 14, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 12 },
  helperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  helperInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  helperAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  helperInitial: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  helperDetails: { flex: 1 },
  helperName: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#ffffff', marginBottom: 2 },
  helperMeta: { flexDirection: 'row', alignItems: 'center' },
  levelBadgeSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
  levelTextSmall: { fontSize: 8, fontFamily: 'Inter-SemiBold' },
  matchPercent: { fontSize: 10, fontFamily: 'Inter-Regular', color: '#999999' },
  helpButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },

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
