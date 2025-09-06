import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Switch,
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
import { ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const userStats = {
    name: 'Sarah Johnson',
    level: 'Senior',
    timezone: 'PST',
    streak: 7,
    totalStandups: 45,
    helpProvided: 23,
    blockersSolved: 18,
    podHistory: 6,
    skills: ['React Native', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
    joinedDate: 'Oct 2024',
  };

  const achievements = [
    {
      id: '1',
      title: 'Helpful Hero',
      description: 'Helped 20+ developers',
      icon: '🦸',
      unlocked: true,
    },
    {
      id: '2',
      title: 'Consistency King',
      description: '30-day standup streak',
      icon: '👑',
      unlocked: false,
    },
    {
      id: '3',
      title: 'Problem Solver',
      description: 'Resolved 50+ blockers',
      icon: '🧠',
      unlocked: false,
    },
  ];

  const [signingOut, setSigningOut] = useState(false);
  const [dnd, setDnd] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [aiTips, setAiTips] = useState(true);
  const [weeklyGoal, setWeeklyGoal] = useState(5);

  const completedAchievements = achievements.filter((a) => a.unlocked).length;
  const profileCompletion = useMemo(() => {
    const base = 40;
    const skillsPart = Math.min(30, userStats.skills.length * 5);
    const achievePart = Math.min(30, completedAchievements * 10);
    return Math.min(100, base + skillsPart + achievePart);
  }, [completedAchievements, userStats.skills.length]);

  const getLevelColor = (level: string) => {
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

  const recentPods = [
    { id: 'p1', name: 'React Natives', period: 'Current' },
    { id: 'p2', name: 'Perf Champs', period: '2024 Q2' },
    { id: 'p3', name: 'Expo Router Crew', period: '2024 Q1' },
  ];

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      router.replace('/(auth)/sign-in');
    } catch (e: any) {
      Alert.alert('Sign out failed', e?.message ?? 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0a0a0a', '#000000']}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={styles.header}
          >
            <Text style={styles.title}>Profile</Text>
            <TouchableOpacity style={styles.settingsButton}>
              <Settings color="#ffffff" size={20} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(280).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={25} style={styles.profileCardGlass}>
              <View style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>SJ</Text>
                    </View>
                    <View style={styles.onlineBadge}>
                      <View style={styles.onlineDot} />
                    </View>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{userStats.name}</Text>
                    <View style={styles.profileMeta}>
                      <View
                        style={[
                          styles.levelBadge,
                          {
                            backgroundColor:
                              getLevelColor(userStats.level) + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.levelText,
                            { color: getLevelColor(userStats.level) },
                          ]}
                        >
                          {userStats.level} Developer
                        </Text>
                      </View>
                      <View style={styles.locationRow}>
                        <MapPin color="#666666" size={12} />
                        <Text style={styles.timezone}>
                          {userStats.timezone}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.streakSection}>
                  <View style={styles.streakCard}>
                    <Zap color="#ffff00" size={20} />
                    <Text style={styles.streakNumber}>{userStats.streak}</Text>
                    <Text style={styles.streakLabel}>Day Streak</Text>
                  </View>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(340).springify()}
            style={styles.statsContainer}
          >
            <View style={styles.statsGrid}>
              <BlurView intensity={15} style={styles.statGlass}>
                <View style={styles.statCard}>
                  <Clock color="#ffffff" size={20} />
                  <Text style={styles.statNumber}>
                    {userStats.totalStandups}
                  </Text>
                  <Text style={styles.statLabel}>Standups</Text>
                </View>
              </BlurView>

              <BlurView intensity={15} style={styles.statGlass}>
                <View style={styles.statCard}>
                  <Star color="#ffaa00" size={20} />
                  <Text style={styles.statNumber}>
                    {userStats.helpProvided}
                  </Text>
                  <Text style={styles.statLabel}>Helped</Text>
                </View>
              </BlurView>

              <BlurView intensity={15} style={styles.statGlass}>
                <View style={styles.statCard}>
                  <Users color="#6699ff" size={20} />
                  <Text style={styles.statNumber}>{userStats.podHistory}</Text>
                  <Text style={styles.statLabel}>Pods</Text>
                </View>
              </BlurView>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(420).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Award color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Progress & Goals</Text>
                </View>

                <Text style={styles.metaLabel}>Profile completeness</Text>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${profileCompletion}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressPct}>{profileCompletion}%</Text>

                <View style={styles.goalRow}>
                  <Text style={styles.metaLabel}>Weekly standup goal</Text>
                  <View style={styles.goalControls}>
                    <TouchableOpacity
                      onPress={() => setWeeklyGoal((g) => Math.max(1, g - 1))}
                      style={styles.goalBtn}
                    >
                      <Text style={styles.goalBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.goalValue}>{weeklyGoal}</Text>
                    <TouchableOpacity
                      onPress={() => setWeeklyGoal((g) => Math.min(14, g + 1))}
                      style={styles.goalBtn}
                    >
                      <Text style={styles.goalBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(500).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Code color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Skills</Text>
                </View>
                <View style={styles.skillsContainer}>
                  {userStats.skills.map((skill, index) => (
                    <Animated.View
                      key={skill}
                      entering={FadeInRight.delay(560 + index * 50).springify()}
                      style={styles.skillChip}
                    >
                      <Text style={styles.skillText}>{skill}</Text>
                    </Animated.View>
                  ))}
                </View>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(560).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Users color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Connected Accounts</Text>
                </View>
                <View style={styles.accountsRow}>
                  <TouchableOpacity style={styles.accountChip}>
                    <Github size={16} color="#fff" />
                    <Text style={styles.accountText}>GitHub • Connected</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.accountChip}>
                    <Users size={16} color="#fff" />
                    <Text style={styles.accountText}>Jira • Connect</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.accountChip}>
                    <Slack size={16} color="#fff" />
                    <Text style={styles.accountText}>Slack • Connected</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(620).springify()}
            style={styles.cardContainer}
          >
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
                  <Switch value={dnd} onValueChange={setDnd} />
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>Standup reminders</Text>
                    <Text style={styles.prefSub}>10 minutes before</Text>
                  </View>
                  <Switch value={reminders} onValueChange={setReminders} />
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefInfo}>
                    <Text style={styles.prefTitle}>AI coach tips</Text>
                    <Text style={styles.prefSub}>Contextual suggestions</Text>
                  </View>
                  <Switch value={aiTips} onValueChange={setAiTips} />
                </View>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(700).springify()}
            style={styles.cardContainer}
          >
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
                    style={[
                      styles.achievementRow,
                      !achievement.unlocked && styles.achievementLocked,
                    ]}
                  >
                    <Text style={styles.achievementIcon}>
                      {achievement.icon}
                    </Text>
                    <View style={styles.achievementInfo}>
                      <Text
                        style={[
                          styles.achievementTitle,
                          !achievement.unlocked &&
                            styles.achievementTitleLocked,
                        ]}
                      >
                        {achievement.title}
                      </Text>
                      <Text style={styles.achievementDescription}>
                        {achievement.description}
                      </Text>
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

          <Animated.View
            entering={FadeInDown.delay(780).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Users color="#ffffff" size={20} />
                  <Text style={styles.cardTitle}>Pod History</Text>
                </View>
                {recentPods.map((p, idx) => (
                  <View
                    key={p.id}
                    style={[
                      styles.historyRow,
                      idx < recentPods.length - 1 && styles.historyRowBorder,
                    ]}
                  >
                    <Text style={styles.historyName}>{p.name}</Text>
                    <Text style={styles.historyPeriod}>{p.period}</Text>
                  </View>
                ))}
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(840).springify()}
            style={styles.signOutContainer}
          >
            <TouchableOpacity
              style={[styles.signOutButton, signingOut && { opacity: 0.6 }]}
              onPress={handleSignOut}
              disabled={signingOut}
              activeOpacity={0.8}
            >
              {signingOut ? (
                <ActivityIndicator color="#ff6b6b" />
              ) : (
                <LogOut color="#ff6b6b" size={18} />
              )}
              <Text style={styles.signOutText}>
                {signingOut ? 'Signing out…' : 'Sign Out'}
              </Text>
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
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
