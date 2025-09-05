import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Pressable,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Users, Clock, Mic, Settings, MapPin, Star, ArrowRight, UserPlus, Share2, LogOut } from 'lucide-react-native';
import Chip from '@/components/ui/Chip';
import { usePodData } from '@/hooks/usePodData';
import { router } from 'expo-router';

export default function PodsScreen() {
  const { data, loading, error, create, leave } = usePodData();
  const buttonScale = useSharedValue(1);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tz, setTz] = useState('UTC');
  const [saving, setSaving] = useState(false);

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

  // ---------- Empty state
  if (!loading && !currentPod) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#000', '#0a0a0a', '#000']} style={styles.gradient}>
          <ScrollView contentContainerStyle={[styles.scrollContent, { justifyContent: 'center', flexGrow: 1 }]}>
            <Text style={[styles.title, { textAlign: 'center', marginBottom: 12 }]}>No pod yet</Text>
            <Text style={{ color: '#999', textAlign: 'center', marginBottom: 10 }}>
              Create a pod and invite teammates to start daily standups.
            </Text>
            {!!error && (
              <Text style={{ color: '#ff8a8a', textAlign: 'center', marginBottom: 8 }}>
                {error}
              </Text>
            )}
            <Pressable style={[styles.actionPrimary]} onPress={() => setShowCreate(true)}>
              <Text style={styles.actionPrimaryText}>Create Pod</Text>
            </Pressable>
          </ScrollView>
        </LinearGradient>

        {/* Create Pod modal */}
        <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Create Pod</Text>
              <TextInput
                placeholder="Name (e.g., React Natives)" placeholderTextColor="#888"
                style={styles.input} value={name} onChangeText={setName}
              />
              <TextInput
                placeholder="Description" placeholderTextColor="#888"
                style={[styles.input, { height: 80 }]} value={desc} onChangeText={setDesc} multiline
              />
              <TextInput
                placeholder="Timezone (IANA, e.g., UTC or Africa/Lagos)" placeholderTextColor="#888"
                style={styles.input} value={tz} onChangeText={setTz}
              />
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
      </View>
    );
  }

  // ---------- Loading
  if (loading || !currentPod) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // ---------- Main view
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0a', '#000000']} style={styles.gradient}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.header}>
            <Text style={styles.title}>Your Pod</Text>
            <TouchableOpacity style={styles.settingsButton} onPress={() => setShowCreate(true)}>
              <Settings color="#ffffff" size={20} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.cardContainer}>
            <BlurView intensity={25} style={styles.podCardGlass}>
              <View style={styles.podCard}>

                {/* Header */}
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

                {/* Week strip (from DB week_schedule) */}
                <View style={styles.weekRow}>
                  {currentPod.weekSchedule.map((w) => (
                    <View key={w.d} style={styles.weekChip}>
                      <Text style={styles.weekDay}>{w.d}</Text>
                      <Text style={styles.weekTime}>{w.times.length ? w.times.join(', ') : '—'}</Text>
                    </View>
                  ))}
                </View>

                {/* Next standup */}
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

                {/* Members */}
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

                {/* Actions */}
                <View style={styles.actionsRow}>
                  <Pressable style={styles.actionBtn} onPress={() => {/* TODO: invite flow */}}>
                    <UserPlus size={16} color="#000" />
                    <Text style={styles.actionBtnText}>Invite</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnSecondary} onPress={() => {/* TODO: share link */}}>
                    <Share2 size={16} color="#fff" />
                    <Text style={styles.actionBtnSecondaryText}>Share</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnDanger} onPress={leave}>
                    <LogOut size={16} color="#111" />
                    <Text style={styles.actionBtnDangerText}>Leave</Text>
                  </Pressable>
                </View>

                {/* Join */}
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

      {/* Create Pod modal */}
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

  cardContainer: { marginBottom: 20 },
  podCardGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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

  // Modal
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
});
