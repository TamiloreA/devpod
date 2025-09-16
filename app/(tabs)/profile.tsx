import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
  Star,
  Clock,
  Users,
  Award,
  Settings,
  LogOut,
  MapPin,
  Code,
  Zap,
  Github,
  Slack,
} from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { listMyConnections, startProviderConnect, disconnectProvider } from '@/lib/connections';

const { width } = Dimensions.get('window');

type ProfileRow = {
  id: string;
  display_name: string | null;
  level: 'Junior' | 'Mid' | 'Senior' | string | null;
  timezone: string | null;
  skills: string[] | null;
  created_at?: string | null;
};

type UserPrefs = {
  user_id: string;
  dnd: boolean;
  reminders: boolean;
  ai_tips: boolean;
  weekly_goal: number;
};

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ refreshConnections?: string }>();

  const [loading, setLoading] = useState(true);
  const [authUid, setAuthUid] = useState<string | null>(null);

  // Profile basics
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // Stats
  const [streak, setStreak] = useState(0);
  const [totalStandups, setTotalStandups] = useState(0);
  const [helpProvided, setHelpProvided] = useState(0);
  const [blockersSolved, setBlockersSolved] = useState(0);
  const [podHistory, setPodHistory] = useState(0);

  // Prefs (persisted)
  const [dnd, setDnd] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [aiTips, setAiTips] = useState(true);
  const [weeklyGoal, setWeeklyGoal] = useState(5);
  const [savingPref, setSavingPref] = useState<null | keyof UserPrefs>(null);

  // Connections
  const [connections, setConnections] = useState<Record<string, { is_valid: boolean; metadata: any }>>({});
  const [busy, setBusy] = useState<null | 'github' | 'slack' | 'jira'>(null);

  const initials = useMemo(() => {
    const name = profile?.display_name ?? 'User';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
  }, [profile?.display_name]);

  const skills = useMemo(
    () => (Array.isArray(profile?.skills) ? profile!.skills : []),
    [profile?.skills]
  );

  // Achievements derived from stats
  const achievements = useMemo(
    () => [
      {
        id: '1',
        title: 'Helpful Hero',
        description: 'Helped 20+ developers',
        icon: '🦸',
        unlocked: helpProvided >= 20,
      },
      {
        id: '2',
        title: 'Consistency King',
        description: '30-day standup streak',
        icon: '👑',
        unlocked: streak >= 30,
      },
      {
        id: '3',
        title: 'Problem Solver',
        description: 'Resolved 50+ blockers',
        icon: '🧠',
        unlocked: blockersSolved >= 50,
      },
    ],
    [helpProvided, streak, blockersSolved]
  );

  const completedAchievements = achievements.filter((a) => a.unlocked).length;

  const profileCompletion = useMemo(() => {
    const base = 40;
    const skillsPart = Math.min(30, skills.length * 5);
    const achievePart = Math.min(30, completedAchievements * 10);
    return Math.min(100, base + skillsPart + achievePart);
  }, [skills.length, completedAchievements]);

  const getLevelColor = (level?: string | null) => {
    switch (level) {
      case 'Senior':
        return '#00ff88';
      case 'Mid':
        return '#ffaa00';
      case 'Junior':
        return '#6699ff';
      default:
        return '#ffffff';
    }
  };

  const fmtMonthYear = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  };

  // --- Load everything
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        setAuthUid(uid);
        if (!uid) return;

        // Profile
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name, level, timezone, skills, created_at')
          .eq('id', uid)
          .maybeSingle();
        if (pErr) throw pErr;
        setProfile(p as ProfileRow);

        // Prefs
        try {
          const { data: pref } = await supabase
            .from('user_prefs')
            .select('dnd, reminders, ai_tips, weekly_goal')
            .eq('user_id', uid)
            .maybeSingle();
          if (pref) {
            setDnd(!!pref.dnd);
            setReminders(pref.reminders ?? true);
            setAiTips(pref.ai_tips ?? true);
            setWeeklyGoal(pref.weekly_goal ?? 5);
          }
        } catch {}

        // Stats
        await Promise.all([
          (async () => {
            try {
              const { count } = await supabase
                .from('standups')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', uid);
              setTotalStandups(count ?? 0);

              const { data: last } = await supabase
                .from('standups')
                .select('created_at')
                .eq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(60);
              const days = Array.from(new Set((last ?? []).map((r: any) => new Date(r.created_at).toDateString())));
              let s = 0;
              let d = new Date();
              while (days.includes(d.toDateString())) {
                s++;
                d.setDate(d.getDate() - 1);
              }
              setStreak(s);
            } catch {
              setTotalStandups(0);
              setStreak(0);
            }
          })(),
          (async () => {
            try {
              const { count } = await supabase
                .from('blockers')
                .select('*', { count: 'exact', head: true })
                .eq('helper_user_id', uid);
              setHelpProvided(count ?? 0);
            } catch { setHelpProvided(0); }
          })(),
          (async () => {
            try {
              const { count } = await supabase
                .from('blockers')
                .select('*', { count: 'exact', head: true })
                .eq('helper_user_id', uid)
                .eq('status', 'resolved');
              setBlockersSolved(count ?? 0);
            } catch { setBlockersSolved(0); }
          })(),
          (async () => {
            try {
              const { data, error } = await supabase
                .from('pod_members')
                .select('pod_id')
                .eq('user_id', uid);
              if (error) throw error;
              const unique = new Set((data ?? []).map((r: any) => r.pod_id)).size;
              setPodHistory(unique);
            } catch { setPodHistory(0); }
          })(),
        ]);

        // Initial connections fetch
        await refreshConnections();
      } catch (e: any) {
        console.error('profile.init', e);
        Alert.alert('Could not load profile', e?.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Refresh connections helper
  const refreshConnections = useCallback(async () => {
    try {
      const m = await listMyConnections();
      setConnections(m);
    } catch (e: any) {
      console.log('connections.fetch', e?.message);
    }
  }, []);

  // Refetch on focus (handy after deep-link return)
  useFocusEffect(
    useCallback(() => {
      if (params?.refreshConnections === '1') {
        refreshConnections();
      }
    }, [params?.refreshConnections, refreshConnections])
  );

  // --- Save prefs helper
  const savePref = useCallback(
    async (patch: Partial<UserPrefs>) => {
      if (!authUid) return;
      const key = (Object.keys(patch)[0] ?? null) as keyof UserPrefs | null;
      if (key) setSavingPref(key);
      try {
        await supabase.from('user_prefs').upsert(
          {
            user_id: authUid,
            dnd,
            reminders,
            ai_tips: aiTips,
            weekly_goal: weeklyGoal,
            ...patch,
          },
          { onConflict: 'user_id' }
        );
      } catch (e: any) {
        console.error('prefs.save', e);
        Alert.alert('Could not save preference', e?.message ?? 'Try again.');
      } finally {
        if (key) setSavingPref(null);
      }
    },
    [authUid, dnd, reminders, aiTips, weeklyGoal]
  );

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/(auth)/sign-in');
    } catch (e: any) {
      Alert.alert('Sign out failed', e?.message ?? 'Please try again.');
    }
  }, []);

  const handleConnectOrDisconnect = useCallback(
    async (provider: 'github' | 'slack' | 'jira') => {
      const connected = !!connections[provider]?.is_valid;
      try {
        setBusy(provider);
        if (connected) {
          const go = await new Promise<boolean>((resolve) =>
            Alert.alert(
              'Disconnect',
              `Disconnect ${provider}?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Disconnect', style: 'destructive', onPress: () => resolve(true) },
              ],
              { cancelable: true }
            )
          );
          if (!go) return;
          await disconnectProvider(provider);
          await refreshConnections();
        } else {
          await startProviderConnect(provider);
          // After browser flow, our deep-link screen routes back and triggers refresh.
          // Doing a light refresh here too doesn’t hurt on web/simulator.
          setTimeout(refreshConnections, 800);
        }
      } catch (e: any) {
        Alert.alert('Connection error', e?.message ?? 'Please try again.');
      } finally {
        setBusy(null);
      }
    },
    [connections, refreshConnections]
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0a', '#000000']} style={styles.gradient}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <TouchableOpacity style={styles.settingsButton}>
              <Settings color="#ffffff" size={20} />
            </TouchableOpacity>
          </Animated.View>

          {/* Profile card */}
          <Animated.View entering={FadeInDown.delay(280).springify()} style={styles.cardContainer}>
            <BlurView intensity={25} style={styles.profileCardGlass}>
              <View style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={styles.onlineBadge}>
                      <View style={styles.onlineDot} />
                    </View>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{profile?.display_name ?? 'Your Name'}</Text>
                    <View style={styles.profileMeta}>
                      <View style={[styles.levelBadge, { backgroundColor: getLevelColor(profile?.level) + '20' }]}>
                        <Text style={[styles.levelText, { color: getLevelColor(profile?.level) }]}>
                          {(profile?.level ?? 'Member')} {profile?.level ? 'Developer' : ''}
                        </Text>
                      </View>
                      <View style={styles.locationRow}>
                        <MapPin color="#666666" size={12} />
                        <Text style={styles.timezone}>{profile?.timezone ?? 'UTC'}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.streakSection}>
                  <View style={styles.streakCard}>
                    <Zap color="#ffff00" size={20} />
                    <Text style={styles.streakNumber}>{streak}</Text>
                    <Text style={styles.streakLabel}>Day Streak</Text>
                    {!!profile?.created_at && (
                      <Text style={[styles.streakLabel, { marginTop: 6 }]}>
                        Joined {fmtMonthYear(profile.created_at)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Stats */}
          <Animated.View entering={FadeInDown.delay(340).springify()} style={styles.statsContainer}>
            <View style={styles.statsGrid}>
              <BlurView intensity={15} style={styles.statGlass}>
                <View style={styles.statCard}>
                  <Clock color="#ffffff" size={20} />
                  <Text style={styles.statNumber}>{totalStandups}</Text>
                  <Text style={styles.statLabel}>Standups</Text>
                </View>
              </BlurView>

              <BlurView intensity={15} style={styles.statGlass}>
                <View style={styles.statCard}>
                  <Star color="#ffaa00" size={20} />
                  <Text style={styles.statNumber}>{helpProvided}</Text>
                  <Text style={styles.statLabel}>Helped</Text>
                </View>
              </BlurView>

              <BlurView intensity={15} style={styles.statGlass}>
                <View style={styles.statCard}>
                  <Users color="#6699ff" size={20} />
                  <Text style={styles.statNumber}>{podHistory}</Text>
                  <Text style={styles.statLabel}>Pods</Text>
                </View>
              </BlurView>
            </View>
          </Animated.View>

          {/* Progress & goals */}
          <Animated.View entering={FadeInDown.delay(420).springify()} style={styles.cardContainer}>
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Award color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Progress & Goals</Text>
                </View>

                <Text style={styles.metaLabel}>Profile completeness</Text>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${profileCompletion}%` }]} />
                </View>
                <Text style={styles.progressPct}>{profileCompletion}%</Text>

                <View style={styles.goalRow}>
                  <Text style={styles.metaLabel}>Weekly standup goal</Text>
                  <View style={styles.goalControls}>
                    <TouchableOpacity
                      onPress={async () => {
                        const next = Math.max(1, weeklyGoal - 1);
                        setWeeklyGoal(next);
                        await savePref({ weekly_goal: next });
                      }}
                      style={styles.goalBtn}
                    >
                      <Text style={styles.goalBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.goalValue}>{weeklyGoal}</Text>
                    <TouchableOpacity
                      onPress={async () => {
                        const next = Math.min(14, weeklyGoal + 1);
                        setWeeklyGoal(next);
                        await savePref({ weekly_goal: next });
                      }}
                      style={styles.goalBtn}
                    >
                      <Text style={styles.goalBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Skills */}
          <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.cardContainer}>
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Code color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Skills</Text>
                </View>
                <View style={styles.skillsContainer}>
                  {(skills.length ? skills : ['Add skills in profile']).map((skill, index) => (
                    <Animated.View key={`${skill}-${index}`} entering={FadeInRight.delay(560 + index * 50).springify()} style={styles.skillChip}>
                      <Text style={styles.skillText}>{skill}</Text>
                    </Animated.View>
                  ))}
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Connected accounts */}
          <Animated.View entering={FadeInDown.delay(560).springify()} style={styles.cardContainer}>
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Users color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Connected Accounts</Text>
                </View>

                <View style={styles.accountsRow}>
                  <TouchableOpacity
                    style={styles.accountChip}
                    onPress={() => handleConnectOrDisconnect('github')}
                    disabled={busy === 'github'}
                  >
                    <Github size={16} color="#fff" />
                    <Text style={styles.accountText}>
                      GitHub • {busy === 'github' ? 'Working…' : (connections.github?.is_valid ? 'Connected' : 'Connect')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.accountChip}
                    onPress={() => handleConnectOrDisconnect('slack')}
                    disabled={busy === 'slack'}
                  >
                    <Slack size={16} color="#fff" />
                    <Text style={styles.accountText}>
                      Slack • {busy === 'slack' ? 'Working…' : (connections.slack?.is_valid ? 'Connected' : 'Connect')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.accountChip}
                    onPress={() => handleConnectOrDisconnect('jira')}
                    disabled={busy === 'jira'}
                  >
                    <Users size={16} color="#fff" />
                    <Text style={styles.accountText}>
                      Jira • {busy === 'jira' ? 'Working…' : (connections.jira?.is_valid ? 'Connected' : 'Connect')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* (Optional) Tiny metadata peek */}
                {!!connections.github?.metadata?.team && (
                  <Text style={{ color: '#9aa0a6', fontSize: 12, marginTop: 8 }}>
                    GitHub: {JSON.stringify(connections.github.metadata)}
                  </Text>
                )}
              </View>
            </BlurView>
          </Animated.View>

          {/* Preferences */}
          <Animated.View entering={FadeInDown.delay(620).springify()} style={styles.cardContainer}>
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Settings color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Preferences</Text>
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>Do Not Disturb</Text>
                    <Text style={styles.prefSub}>Mute notifications</Text>
                  </View>
                  <Switch
                    value={dnd}
                    onValueChange={async (v) => {
                      setDnd(v);
                      await savePref({ dnd: v });
                    }}
                  />
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>Standup reminders</Text>
                    <Text style={styles.prefSub}>10 minutes before</Text>
                  </View>
                  <Switch
                    value={reminders}
                    onValueChange={async (v) => {
                      setReminders(v);
                      await savePref({ reminders: v });
                    }}
                  />
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>AI coach tips</Text>
                    <Text style={styles.prefSub}>Contextual suggestions</Text>
                  </View>
                  <Switch
                    value={aiTips}
                    onValueChange={async (v) => {
                      setAiTips(v);
                      await savePref({ ai_tips: v });
                    }}
                  />
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Achievements */}
          <Animated.View entering={FadeInDown.delay(700).springify()} style={styles.cardContainer}>
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Award color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Achievements</Text>
                </View>
                {achievements.map((achievement, index) => (
                  <Animated.View
                    key={achievement.id}
                    entering={FadeInDown.delay(760 + index * 80).springify()}
                    style={[styles.achievementRow, !achievement.unlocked && styles.achievementLocked]}
                  >
                    <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                    <View style={styles.achievementInfo}>
                      <Text style={[styles.achievementTitle, !achievement.unlocked && styles.achievementTitleLocked]}>
                        {achievement.title}
                      </Text>
                      <Text style={styles.achievementDescription}>{achievement.description}</Text>
                    </View>
                    {achievement.unlocked && (
                      <View style={styles.unlockedBadge}>
                        <Star color="#ffaa00" size={16} />
                      </View>
                    )}
                  </Animated.View>
                ))}
              </View>
            </BlurView>
          </Animated.View>

          {/* Pod history */}
          <Animated.View entering={FadeInDown.delay(760).springify()} style={styles.cardContainer}>
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Users color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Pod History</Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyName}>Pods you’ve joined</Text>
                  <Text style={styles.historyPeriod}>{podHistory}</Text>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Sign out */}
          <Animated.View entering={FadeInDown.delay(820).springify()} style={styles.signOutContainer}>
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
              <LogOut color="#ff6b6b" size={18} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 120 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  settingsButton: { padding: 8 },

  cardContainer: { marginBottom: 20 },

  profileCardGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardGlass: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  profileCard: { padding: 24 },
  card: { padding: 20 },

  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: { position: 'relative', marginRight: 16 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff88',
  },

  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 8,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  levelText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  timezone: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    marginLeft: 4,
  },

  streakSection: { alignItems: 'center' },
  streakCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  streakNumber: {
    fontSize: 32,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginVertical: 4,
  },
  streakLabel: { fontSize: 12, fontFamily: 'Inter-Regular', color: '#999999' },

  statsContainer: { marginBottom: 8 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statGlass: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statCard: { padding: 16, alignItems: 'center' },
  statNumber: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: { fontSize: 10, fontFamily: 'Inter-Regular', color: '#999999' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },

  metaLabel: { color: '#cfcfcf', fontSize: 12, marginBottom: 6 },
  progressBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: 999,
  },
  progressPct: { color: '#9ae6b4', fontSize: 12, marginTop: 6 },
  goalRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalControls: { flexDirection: 'row', alignItems: 'center', gap: 8 as any },
  goalBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  goalValue: { color: '#fff', fontSize: 16, fontFamily: 'Inter-SemiBold' },

  skillsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  skillChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  skillText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#ffffff' },

  accountsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 as any },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  accountText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Medium' },

  prefRow: {
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  prefInfo: { flex: 1, paddingRight: 12 },
  prefTitle: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 14 },
  prefSub: { color: '#999', fontSize: 12, marginTop: 2 },

  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  achievementLocked: { opacity: 0.5 },
  achievementIcon: { fontSize: 24, marginRight: 16 },
  achievementInfo: { flex: 1 },
  achievementTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 2,
  },
  achievementTitleLocked: { color: '#666666' },
  achievementDescription: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999999',
  },
  unlockedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 170, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  historyRow: {
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyName: { color: '#fff', fontFamily: 'Inter-Medium' },
  historyPeriod: { color: '#999' },

  signOutContainer: { marginTop: 8 },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
  },
  signOutText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ff6b6b',
    marginLeft: 8,
  },
});
