import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Pressable,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import {
  Users, Clock, Mic, Settings, MapPin, Star, ArrowRight,
  UserPlus, Share2, LogOut, Inbox, X as XIcon, UserMinus, Check as CheckIcon
} from 'lucide-react-native';
import Chip from '@/components/ui/Chip';
import { usePodData } from '@/hooks/usePodData';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

type InviteRow = {
  id: string;
  pod_id: string;
  status: InviteStatus;
  created_at: string;
  invited_user_id?: string | null;
  pods?: { name?: string | null } | null;
};

type SentInviteRow = InviteRow & {
  invited_display_name?: string | null;
};

type SearchedProfile = { id: string; display_name: string | null };

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

export default function PodsScreen() {
  const { data, pods, loading, error, create, leave, createInviteLink, reload, setPrimary } = usePodData();
  const buttonScale = useSharedValue(1);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tz, setTz] = useState('UTC');
  const [saving, setSaving] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  const [showSwitch, setShowSwitch] = useState(false);
  const openSwitch = () => setShowSwitch(true);
  const closeSwitch = () => setShowSwitch(false);

  const [authUid, setAuthUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUid(data.user?.id ?? null));
  }, []);

  const [showInvites, setShowInvites] = useState(false);
  const [invLoading, setInvLoading] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const refreshInvites = async () => {
    if (!authUid) return;
    setInvLoading(true);
    try {
      const { data: rows, error: invErr } = await supabase
        .from('pod_invites')
        .select('id, pod_id, status, created_at, invited_user_id, pods(name)')
        .eq('invited_user_id', authUid)
        .order('created_at', { ascending: false });
      if (invErr) {
        console.error('pod_invites fetch error', invErr);
        setInvites([]);
        return;
      }
      setInvites((rows ?? []) as InviteRow[]);
    } finally {
      setInvLoading(false);
    }
  };
  const openInvites = async () => {
    setShowInvites(true);
    await refreshInvites();
  };
  const pendingCount = useMemo(() => invites.filter((i) => i.status === 'pending').length, [invites]);

  const acceptInvite = async (inv: InviteRow) => {
    if (!authUid) return;
    setActingId(inv.id);
    try {
      const { error: rpcErr } = await supabase.rpc('accept_invite', { p_invite_id: inv.id });
      if (rpcErr) throw rpcErr;
  
      await refreshInvites();
      await reload();
      Alert.alert('Joined', `You joined ${inv.pods?.name ?? 'the pod'}.`);
    } catch (e: any) {
      console.error('accept invite error', e);
      Alert.alert('Could not accept invite', e?.message ?? 'Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const declineInvite = async (inv: InviteRow) => {
    setActingId(inv.id);
    try {
      const { error: uErr } = await supabase
        .from('pod_invites')
        .update({ status: 'declined' })
        .eq('id', inv.id);
      if (uErr) throw uErr;
      await refreshInvites();
    } catch (e: any) {
      console.error('decline invite error', e);
      Alert.alert('Could not decline invite', e?.message ?? 'Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const [showInvitePeople, setShowInvitePeople] = useState(false);
  const [search, setSearch] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [results, setResults] = useState<SearchedProfile[]>([]);
  const [sentBusy, setSentBusy] = useState<string | null>(null); 
  const [sentInvites, setSentInvites] = useState<SentInviteRow[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const currentPodId = data?.podId ?? null;
  const currentMemberIds = useMemo(() => new Set((data?.members ?? []).map(m => m.id)), [data?.members]);

  const openInvitePeople = async () => {
    setShowInvitePeople(true);
    setTimeout(() => (void fetchSentInvites()), 0);
    setResults([]);
    setSearch('');
  };

  const fetchSentInvites = async () => {
    if (!authUid || !currentPodId) return;
    setSentLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('pod_invites')
        .select('id, pod_id, status, created_at, invited_user_id')
        .eq('inviter_user_id', authUid)
        .eq('pod_id', currentPodId)
        .in('status', ['pending', 'declined', 'expired'])
        .order('created_at', { ascending: false });
      if (error) {
        console.error('fetchSentInvites error', error);
        setSentInvites([]);
        return;
      }

      const base = (rows ?? []) as SentInviteRow[];

      const ids = Array.from(new Set(base.map(r => r.invited_user_id).filter(Boolean))) as string[];
      let nameById = new Map<string, string | null>();
      if (ids.length) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', ids);
        if (pErr) {
          console.error('profiles for sent invites error', pErr);
        } else {
          nameById = new Map((profs ?? []).map(p => [p.id as string, (p.display_name ?? null) as string | null]));
        }
      }

      const withNames = base.map(r => ({
        ...r,
        invited_display_name: r.invited_user_id ? (nameById.get(r.invited_user_id) ?? null) : null,
      }));

      setSentInvites(withNames);
    } finally {
      setSentLoading(false);
    }
  };

  useEffect(() => {
    if (!showInvitePeople) return;
    const t = setTimeout(async () => {
      const q = search.trim();
      if (!q) {
        setResults([]);
        return;
      }
      if (!currentPodId || !authUid) return;

      setSearchBusy(true);
      try {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name')
          .ilike('display_name', `%${q}%`)
          .limit(25);

        if (pErr) {
          console.error('search profiles error', pErr);
          setResults([]);
          return;
        }

        const pendingInviteeIds = new Set(
          sentInvites.filter(si => si.status === 'pending').map(si => si.invited_user_id).filter(Boolean) as string[]
        );
        const filtered = (profs ?? [])
          .filter(p => !!p.id)
          .filter(p => p.id !== authUid)
          .filter(p => !currentMemberIds.has(p.id))
          .filter(p => !pendingInviteeIds.has(p.id));

        setResults(filtered as SearchedProfile[]);
      } finally {
        setSearchBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, showInvitePeople, currentPodId, authUid, sentInvites]);

  const sendInvite = async (inviteeId: string) => {
    if (!authUid || !currentPodId) return;
    setSentBusy(inviteeId);
    try {
      const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      const { error } = await supabase
        .from('pod_invites')
        .insert([{
          pod_id: currentPodId,
          inviter_user_id: authUid,
          invited_user_id: inviteeId,
          status: 'pending',
          expires_at: expiresAt
        }]);
      if (error && (error as any).code !== '23505') throw error;
      await fetchSentInvites();
      setResults(prev => prev.filter(p => p.id !== inviteeId));
    } catch (e: any) {
      console.error('sendInvite error', e);
      Alert.alert('Invite failed', e?.message ?? 'Could not send invite.');
    } finally {
      setSentBusy(null);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    setSentBusy(inviteId);
    try {
      const { error } = await supabase
        .from('pod_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId);
      if (error) throw error;
      await fetchSentInvites();
    } catch (e: any) {
      console.error('cancelInvite error', e);
      Alert.alert('Could not cancel invite', e?.message ?? 'Please try again.');
    } finally {
      setSentBusy(null);
    }
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));
  const handleJoinStandup = () => {
    buttonScale.value = withSpring(0.95, { duration: 100 }, () => {
      buttonScale.value = withSpring(1);
    });
    if (data?.podId) {
      router.push({ pathname: '/standup/[podId]', params: { podId: data.podId } });
    }
  };

  const getLevelColor = (level?: string | null) => {
    switch (level) {
      case 'Senior': return '#00ff88';
      case 'Mid':    return '#ffaa00';
      case 'Junior': return '#6699ff';
      default:       return '#ffffff';
    }
  };

  const currentPod = data ?? null;
  const onlineCount = currentPod?.members?.filter(m => !!m.online).length ?? 0;

  if (!loading && !currentPod) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#000', '#0a0a0a', '#000']} style={styles.gradient}>
          <ScrollView contentContainerStyle={[styles.scrollContent, { justifyContent: 'center', flexGrow: 1 }]}>
            <Text style={[styles.title, { textAlign: 'center', marginBottom: 12 }]}>No pod yet</Text>
            <Text style={{ color: '#999', textAlign: 'center', marginBottom: 10 }}>
              Create a pod or accept an invite to get started.
            </Text>
            {!!error && <Text style={{ color: '#ff8a8a', textAlign: 'center', marginBottom: 8 }}>{error}</Text>}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[styles.actionPrimary, { flex: 1 }]} onPress={() => setShowCreate(true)}>
                <Text style={styles.actionPrimaryText}>Create Pod</Text>
              </Pressable>
              <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={openInvites}>
                <Text style={styles.actionSecondaryText}>Review Invites</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>

        <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Create Pod</Text>
              <TextInput placeholder="Name (e.g., React Natives)" placeholderTextColor="#888" style={styles.input} value={name} onChangeText={setName} />
              <TextInput placeholder="Description" placeholderTextColor="#888" style={[styles.input, { height: 80 }]} value={desc} onChangeText={setDesc} multiline />
              <TextInput placeholder="Timezone (IANA, e.g., UTC or Africa/Lagos)" placeholderTextColor="#888" style={styles.input} value={tz} onChangeText={setTz} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={() => setShowCreate(false)}>
                  <Text style={styles.actionSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionPrimary, { flex: 1, opacity: saving || !name.trim() ? 0.7 : 1 }]}
                  disabled={saving || !name.trim()}
                  onPress={async () => {
                    try {
                      setSaving(true);
                      await create({ name: name.trim(), description: desc.trim() || undefined, timezone: tz.trim() || undefined });
                      setShowCreate(false);
                      setName(''); setDesc('');
                    } catch (e) {
                      console.error('Create pod failed', e);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? <ActivityIndicator /> : <Text style={styles.actionPrimaryText}>Create</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showInvites} transparent animationType="fade" onRequestClose={() => setShowInvites(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Your Invites</Text>
              {invLoading ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator /></View>
              ) : invites.length === 0 ? (
                <Text style={{ color: '#9aa0a6', textAlign: 'center', paddingVertical: 18 }}>You have no invites.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 360 }}>
                  {invites.map((inv) => {
                    const podName = inv.pods?.name ?? 'Pod';
                    const isPending = inv.status === 'pending';
                    const isActing = actingId === inv.id;
                    return (
                      <View key={inv.id} style={styles.inviteRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.invitePod}>{podName}</Text>
                          <Text style={styles.inviteMeta}>{inv.status.toUpperCase()} • invited {timeAgo(inv.created_at)} ago</Text>
                        </View>
                        {isPending ? (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable style={[styles.invBtnPrimary, isActing && { opacity: 0.7 }]} onPress={() => acceptInvite(inv)} disabled={isActing}>
                              {isActing ? <ActivityIndicator /> : <Text style={styles.invBtnPrimaryText}>Accept</Text>}
                            </Pressable>
                            <Pressable style={[styles.invBtnSecondary, isActing && { opacity: 0.7 }]} onPress={() => declineInvite(inv)} disabled={isActing}>
                              <Text style={styles.invBtnSecondaryText}>Decline</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <View style={styles.invStatusPill}><Text style={styles.invStatusText}>{inv.status}</Text></View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={() => setShowInvites(false)}>
                  <Text style={styles.actionSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  if (loading || !currentPod) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const onShareCopy = async () => {
    if (!currentPod) return;
    try {
      setLinkBusy(true);
      const link = await createInviteLink({ preferDeepLink: false });
      await Clipboard.setStringAsync(link);
      Alert.alert('Link copied', 'Your invite link is on the clipboard.');
    } catch (e: any) {
      console.error('copy link error', e);
      Alert.alert('Share failed', e?.message ?? 'Could not prepare share link.');
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0a', '#000000']} style={styles.gradient}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.title}>Your Pod</Text>
              {pods && pods.length > 1 && (
                <Pressable onPress={openSwitch} style={styles.podSwitchPill}>
                  <Users size={14} color="#fff" />
                  <Text style={styles.podSwitchText}>{pods.length}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable style={styles.invitesBtn} onPress={openInvites}>
                <Inbox size={18} color="#fff" />
                <Text style={styles.invitesBtnText}>Invites</Text>
                {pendingCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>}
              </Pressable>
              <TouchableOpacity style={styles.settingsButton} onPress={openSwitch}>
                <Settings color="#ffffff" size={20} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.cardContainer}>
            <BlurView intensity={25} style={styles.podCardGlass}>
              <View style={styles.podCard}>

                <View style={styles.podHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.podName}>{currentPod.name}</Text>
                    {!!currentPod.description && <Text style={styles.podDescription}>{currentPod.description}</Text>}
                    <View style={styles.tagsRow}>
                      {(currentPod.tags.length ? currentPod.tags : ['#getting-started']).map((t) => (
                        <Chip key={t} text={t} />
                      ))}
                    </View>
                  </View>

                  <View style={styles.podStats}>
                    <View style={styles.statRow}>
                      <Star color="#ffff00" size={16} />
                      <Text style={styles.statText}>{currentPod.streak} days</Text>
                    </View>
                    <View style={styles.statRow}>
                      <MapPin color="#ffffff" size={16} />
                      <Text style={styles.statText}>{currentPod.timezone}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Users color="#00ff88" size={16} />
                      <Text style={styles.statText}>{onlineCount} online</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.weekRow}>
                  {currentPod.weekSchedule.map((w) => (
                    <View key={w.d} style={styles.weekChip}>
                      <Text style={styles.weekDay}>{w.d}</Text>
                      <Text style={styles.weekTime}>{w.times.length ? w.times.join(', ') : '—'}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.nextStandupContainer}>
                  <View style={styles.nextStandupHeader}>
                    <Clock color="#ffffff" size={18} />
                    <Text style={styles.nextStandupTitle}>Next Standup</Text>
                  </View>
                  <Text style={styles.nextStandupTime}>
                    {currentPod.nextStandupTime ? `${currentPod.nextStandupTime} ${currentPod.timezone}` : '—'}
                  </Text>
                  <Text style={{ color: '#9aa0a6', marginTop: 6, fontSize: 12 }}>
                    All times shown in {currentPod.timezone}
                  </Text>
                </View>

                <View style={styles.membersSection}>
                  <Text style={styles.membersTitle}>Members ({currentPod.members.length})</Text>
                  {currentPod.members.map((member, index) => (
                    <Animated.View
                      key={`${member.id}-${index}`}
                      entering={FadeInDown.delay(400 + index * 80).springify()}
                      style={styles.memberRow}
                    >
                      <View style={styles.memberInfo}>
                        <View style={styles.memberAvatarLarge}>
                          <Text style={styles.memberInitialLarge}>{member.initials}</Text>
                        </View>
                        <View style={styles.memberDetails}>
                          <Text style={styles.memberName}>{member.name}</Text>
                          <View style={styles.memberMeta}>
                            <View style={[styles.levelBadge, { backgroundColor: getLevelColor(member.level) + '20' }]}>
                              <Text style={[styles.levelText, { color: getLevelColor(member.level) }]}>
                                {member.level ?? 'Member'}
                              </Text>
                            </View>
                            <View style={[styles.onlineStatus, { backgroundColor: member.online ? '#00ff88' : '#666666' }]} />
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  ))}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable style={styles.actionBtn} onPress={openInvitePeople}>
                    <UserPlus size={16} color="#000" />
                    <Text style={styles.actionBtnText}>Invite</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtnSecondary, linkBusy && { opacity: 0.7 }]} onPress={onShareCopy} disabled={linkBusy}>
                    <Share2 size={16} color="#fff" />
                    <Text style={styles.actionBtnSecondaryText}>Share</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnDanger} onPress={leave}>
                    <LogOut size={16} color="#111" />
                    <Text style={styles.actionBtnDangerText}>Leave</Text>
                  </Pressable>
                </View>

                <Animated.View style={buttonAnimatedStyle}>
                  <TouchableOpacity style={styles.standupButton} onPress={handleJoinStandup} activeOpacity={0.8}>
                    <Mic color="#000000" size={20} />
                    <Text style={styles.standupButtonText}>Join Standup</Text>
                    <ArrowRight color="#000000" size={20} />
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </BlurView>
          </Animated.View>
        </ScrollView>
      </LinearGradient>

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Pod</Text>
            <TextInput placeholder="Name" placeholderTextColor="#888" style={styles.input} value={name} onChangeText={setName} />
            <TextInput placeholder="Description" placeholderTextColor="#888" style={[styles.input, { height: 80 }]} value={desc} onChangeText={setDesc} multiline />
            <TextInput placeholder="Timezone (e.g., UTC or Africa/Lagos)" placeholderTextColor="#888" style={styles.input} value={tz} onChangeText={setTz} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={() => setShowCreate(false)}>
                <Text style={styles.actionSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actionPrimary, { flex: 1, opacity: saving || !name.trim() ? 0.7 : 1 }]}
                disabled={saving || !name.trim()}
                onPress={async () => {
                  try {
                    setSaving(true);
                    await create({ name: name.trim(), description: desc.trim() || undefined, timezone: tz.trim() || undefined });
                    setShowCreate(false);
                    setName(''); setDesc('');
                  } catch (e) {
                    console.error('Create pod failed', e);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? <ActivityIndicator /> : <Text style={styles.actionPrimaryText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showInvites} transparent animationType="fade" onRequestClose={() => setShowInvites(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Your Invites</Text>
            {invLoading ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator /></View>
            ) : invites.length === 0 ? (
              <Text style={{ color: '#9aa0a6', textAlign: 'center', paddingVertical: 18 }}>You have no invites.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {invites.map((inv) => {
                  const podName = inv.pods?.name ?? 'Pod';
                  const isPending = inv.status === 'pending';
                  const isActing = actingId === inv.id;
                  return (
                    <View key={inv.id} style={styles.inviteRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invitePod}>{podName}</Text>
                        <Text style={styles.inviteMeta}>{inv.status.toUpperCase()} • invited {timeAgo(inv.created_at)} ago</Text>
                      </View>
                      {isPending ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable style={[styles.invBtnPrimary, isActing && { opacity: 0.7 }]} onPress={() => acceptInvite(inv)} disabled={isActing}>
                            {isActing ? <ActivityIndicator /> : <Text style={styles.invBtnPrimaryText}>Accept</Text>}
                          </Pressable>
                          <Pressable style={[styles.invBtnSecondary, isActing && { opacity: 0.7 }]} onPress={() => declineInvite(inv)} disabled={isActing}>
                            <Text style={styles.invBtnSecondaryText}>Decline</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.invStatusPill}><Text style={styles.invStatusText}>{inv.status}</Text></View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={() => setShowInvites(false)}>
                <Text style={styles.actionSecondaryText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pod Switcher modal */}
      <Modal visible={showSwitch} transparent animationType="fade" onRequestClose={closeSwitch}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.modalTitle}>Your Pods</Text>
              <Pressable onPress={closeSwitch}><XIcon color="#fff" size={18} /></Pressable>
            </View>

            {(!pods || pods.length === 0) ? (
              <Text style={{ color: '#9aa0a6' }}>You aren’t in any pods yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {pods.map((p) => {
                  const isPrimary = !!p.isPrimary;
                  return (
                    <View key={p.id} style={styles.podRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 as any }}>
                          <Text style={styles.podRowName}>{p.name}</Text>
                          {isPrimary && (
                            <View style={styles.primaryChip}>
                              <Star size={12} color="#000" />
                              <Text style={styles.primaryChipText}>Primary</Text>
                            </View>
                          )}
                        </View>
                        {!!p.description && <Text style={styles.podRowDesc} numberOfLines={1}>{p.description}</Text>}
                        {!!p.timezone && <Text style={styles.podRowSub}>TZ: {p.timezone}</Text>}
                      </View>

                      {isPrimary ? (
                        <View style={styles.primaryMark}>
                          <CheckIcon size={14} color="#0a0" />
                        </View>
                      ) : (
                        <Pressable
                          style={styles.makePrimaryBtn}
                          onPress={async () => {
                            try {
                              await setPrimary(p.id);
                              closeSwitch();
                            } catch (e: any) {
                              Alert.alert('Could not switch', e?.message ?? 'Try again.');
                            }
                          }}
                        >
                          <Text style={styles.makePrimaryText}>Make Primary</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={() => { closeSwitch(); setShowCreate(true); }}>
                <Text style={styles.actionSecondaryText}>Create New Pod</Text>
              </Pressable>
              <Pressable style={[styles.actionPrimary, { flex: 1 }]} onPress={closeSwitch}>
                <Text style={styles.actionPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite People modal (inviter) */}
      <Modal visible={showInvitePeople} transparent animationType="fade" onRequestClose={() => setShowInvitePeople(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.modalTitle}>Invite People</Text>
              <Pressable onPress={() => setShowInvitePeople(false)}><XIcon color="#fff" size={18} /></Pressable>
            </View>

            {/* Pending you’ve sent */}
            <Text style={[styles.sectionTitle, { marginTop: 4 }]}>Pending Invites</Text>
            {sentLoading ? (
              <View style={{ paddingVertical: 10 }}><ActivityIndicator /></View>
            ) : sentInvites.length === 0 ? (
              <Text style={{ color: '#9aa0a6', fontSize: 12 }}>No pending invites.</Text>
            ) : (
              <View style={{ marginBottom: 8 }}>
                {sentInvites.map((si) => (
                  <View key={si.id} style={styles.sentRow}>
                    <View style={styles.memberAvatarSmall}>
                      <Text style={styles.memberInitialSmall}>
                        {(si.invited_display_name ?? 'U')?.[0]?.toUpperCase() ?? 'U'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sentName}>{si.invited_display_name ?? 'User'}</Text>
                      <Text style={styles.sentMeta}>{si.status.toUpperCase()} • {timeAgo(si.created_at)} ago</Text>
                    </View>
                    {si.status === 'pending' ? (
                      <Pressable
                        style={[styles.invBtnSecondary, sentBusy === si.id && { opacity: 0.7 }]}
                        onPress={() => cancelInvite(si.id)}
                        disabled={sentBusy === si.id}
                      >
                        {sentBusy === si.id ? <ActivityIndicator /> : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <UserMinus size={14} color="#fff" />
                            <Text style={styles.invBtnSecondaryText}>Cancel</Text>
                          </View>
                        )}
                      </Pressable>
                    ) : (
                      <View style={styles.invStatusPill}><Text style={styles.invStatusText}>{si.status}</Text></View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Search */}
            <Text style={styles.sectionTitle}>Search Users</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Type a name…"
              placeholderTextColor="#888"
              style={[styles.input, { marginBottom: 8 }]}
            />
            {searchBusy ? (
              <ActivityIndicator />
            ) : results.length === 0 ? (
              <Text style={{ color: '#9aa0a6', fontSize: 12 }}>No results yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {results.map((p) => {
                  const initial = (p.display_name ?? 'U').trim()?.[0]?.toUpperCase() ?? 'U';
                  const busy = sentBusy === p.id;
                  return (
                    <View key={p.id} style={styles.searchRow}>
                      <View style={styles.memberAvatarSmall}><Text style={styles.memberInitialSmall}>{initial}</Text></View>
                      <Text style={styles.searchName}>{p.display_name ?? 'User'}</Text>
                      <Pressable
                        style={[styles.invBtnPrimary, busy && { opacity: 0.7 }]}
                        onPress={() => sendInvite(p.id)}
                        disabled={busy}
                      >
                        {busy ? <ActivityIndicator /> : <Text style={styles.invBtnPrimaryText}>Invite</Text>}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.actionSecondary, { flex: 1 }]} onPress={() => setShowInvitePeople(false)}>
                <Text style={styles.actionSecondaryText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 120 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  settingsButton: { padding: 8 },

  // small pill showing number of pods / opens switcher
  podSwitchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6 as any,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  podSwitchText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  invitesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6 as any,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  invitesBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  badge: {
    marginLeft: 2, minWidth: 18, paddingHorizontal: 6, height: 18, borderRadius: 9,
    backgroundColor: '#ff6b6b', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#000', fontWeight: '800', fontSize: 11 },

  cardContainer: { marginBottom: 20 },
  podCardGlass: {
    borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  podCard: { padding: 24 },

  podHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  podName: { fontSize: 20, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 4 },
  podDescription: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#999999', marginBottom: 10 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any },

  podStats: { alignItems: 'flex-end', gap: 6 as any },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#ffffff', marginLeft: 4 },

  weekRow: { flexDirection: 'row', gap: 8 as any, marginTop: 8, marginBottom: 16, flexWrap: 'wrap' },
  weekChip: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center',
  },
  weekDay: { color: '#cfcfcf', fontSize: 11, marginBottom: 2 },
  weekTime: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Medium' },

  nextStandupContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16, padding: 16, marginTop: 4, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  nextStandupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nextStandupTitle: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#ffffff', marginLeft: 8 },
  nextStandupTime: { fontSize: 18, fontFamily: 'Inter-SemiBold', color: '#ffffff' },

  membersSection: { marginBottom: 16 },
  membersTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 12 },
  memberRow: { marginBottom: 12 },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  memberAvatarLarge: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  memberInitialLarge: { fontSize: 14, fontFamily: 'Inter-SemiBold', color: '#ffffff' },

  memberAvatarSmall: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  memberInitialSmall: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#ffffff' },

  memberDetails: { flex: 1 },
  memberName: { fontSize: 16, fontFamily: 'Inter-Medium', color: '#ffffff', marginBottom: 4 },
  memberMeta: { flexDirection: 'row', alignItems: 'center' },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
  levelText: { fontSize: 10, fontFamily: 'Inter-SemiBold' },
  onlineStatus: { width: 8, height: 8, borderRadius: 4 },

  actionsRow: { flexDirection: 'row', gap: 8 as any, justifyContent: 'space-between', marginTop: 4, marginBottom: 16 },
  actionBtn: {
    flex: 1, borderRadius: 12, backgroundColor: '#ffffff', paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 as any,
  },
  actionBtnText: { color: '#000', fontWeight: '700' },
  actionBtnSecondary: {
    flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 as any,
  },
  actionBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  actionBtnDanger: {
    flex: 1, borderRadius: 12, backgroundColor: '#ffdbdb', paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 as any,
  },
  actionBtnDangerText: { color: '#111', fontWeight: '800' },

  standupButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24,
  },
  standupButtonText: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#000000', marginHorizontal: 8 },

  // Modals shared
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#111', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  modalTitle: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 18, marginBottom: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 10,
  },
  actionPrimary: {
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionPrimaryText: { color: '#000', fontWeight: '800' },
  actionSecondary: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  actionSecondaryText: { color: '#fff', fontWeight: '700' },

  // Invitee modal rows
  inviteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10 as any,
    paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  invitePod: { color: '#fff', fontWeight: '700' },
  inviteMeta: { color: '#9aa0a6', fontSize: 12 },
  invBtnPrimary: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  invBtnPrimaryText: { color: '#000', fontWeight: '800' },
  invBtnSecondary: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  invBtnSecondaryText: { color: '#000', fontWeight: '800' },
  invStatusPill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  invStatusText: { color: '#cfcfcf', fontWeight: '700', fontSize: 12 },

  // Invite People modal
  sectionTitle: { color: '#fff', fontFamily: 'Inter-SemiBold', marginTop: 10, marginBottom: 6 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10 as any,
    paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  searchName: { color: '#fff', flex: 1 },
  sentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10 as any,
    paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  sentName: { color: '#fff' },
  sentMeta: { color: '#9aa0a6', fontSize: 12 },

  // Pod switcher styles
  podRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 as any,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  podRowName: { color: '#fff', fontWeight: '700' },
  podRowDesc: { color: '#9aa0a6', fontSize: 12 },
  podRowSub: { color: '#9aa0a6', fontSize: 11, marginTop: 2 },
  makePrimaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  makePrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  primaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6 as any,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, backgroundColor: '#fff',
  },
  primaryChipText: { color: '#000', fontWeight: '800', fontSize: 10 },
  primaryMark: {
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'rgba(0,255,136,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,136,0.25)',
  },
});
