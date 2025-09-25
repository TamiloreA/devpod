import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import {
  Users,
  Clock,
  Zap,
  TrendingUp,
  Calendar,
  ArrowRight,
  Mic,
  TriangleAlert as AlertTriangle,
} from 'lucide-react-native';
import GlassCard from '@/components/ui/GlassCard';
import StatPill from '@/components/ui/StatPill';
import Chip from '@/components/ui/Chip';
import AvatarStack from '@/components/ui/AvatarStack';
import { Ionicons } from '@expo/vector-icons';
import { useHomeData } from '@/hooks/useHomeData';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

const statusColor = (
  s: 'invited' | 'going' | 'maybe' | 'declined' | 'checked_in'
) => {
  switch (s) {
    case 'going':
    case 'checked_in':
      return '#00ff88';
    case 'maybe':
      return '#ffaa00';
    case 'declined':
      return '#ff6b6b';
    default:
      return 'rgba(255,255,255,0.35)';
  }
};

export default function HomeScreen() {
  const { data } = useHomeData();
  const pulseValue = useSharedValue(1);
  const [loadingJoin, setLoadingJoin] = React.useState(false);

  React.useEffect(() => {
    pulseValue.value = withRepeat(
      withSequence(
        withSpring(1.05, { duration: 1000 }),
        withSpring(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseValue.value }],
  }));

  const user = data?.user ?? { name: '—', streak: 0 };
  const todayStandup = data?.todayStandup ?? null;
  const coachHint = data?.coachHint ?? '';
  const podSnapshot = data?.podSnapshot ?? {
    name: '—',
    tz: '—',
    tags: [] as string[],
    members: [] as string[],
  };
  const shipLogPreview = data?.shipLogPreview ?? [];
  const recentActivities = data?.recentActivities ?? [];
  const counts = data?.counts ?? {
    podMembers: 0,
    standups: 0,
    openBlockers: 0,
  };

  const hasCoach = !!(coachHint && coachHint.trim());
  const hasCard = !!todayStandup; 
  const canJoin = !!(todayStandup && todayStandup.joinable); 

  const a11yKillProps = {
    accessible: false as const,
    accessibilityElementsHidden: true as const,
  };
  const longPressKill = {
    onLongPress: (e: any) => e?.preventDefault?.(),
    delayLongPress: Platform.OS === 'ios' ? 100000 : 500,
    hitSlop: { top: 8, left: 8, right: 8, bottom: 8 } as const,
  };

  const handleQuickJoin = () => {
    if (!canJoin || !todayStandup) return;
    setLoadingJoin(true);
    router.push({
      pathname: '/standup/[podId]',
      params: { podId: todayStandup.podId, standupId: todayStandup.standupId },
    });
    setTimeout(() => setLoadingJoin(false), 600);
  };

  const participants = todayStandup?.participants ?? [];
  const goingCount = participants.filter(
    (p) => p.status === 'going' || p.status === 'checked_in'
  ).length;
  const maybeCount = participants.filter((p) => p.status === 'maybe').length;
  const invitedCount = participants.filter(
    (p) => p.status === 'invited'
  ).length;
  const declinedCount = participants.filter(
    (p) => p.status === 'declined'
  ).length;

  const timeForDisplay = hasCard ? todayStandup!.timePod : '—';

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
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.username}>{user.name}</Text>
            <View style={styles.streakContainer}>
              <Zap color="#ffff00" size={16} />
              <Text style={styles.streakText}>{user.streak}-day streak</Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(240).springify()}
            style={styles.cardContainer}
          >
            <GlassCard
              title="Coach"
              subtitle={
                hasCoach
                  ? 'Prep for your next standup'
                  : 'No recent check-ins yet'
              }
              right={
                <Ionicons name="sparkles-outline" size={18} color="#cfe3ff" />
              }
            >
              <Text style={styles.coachText}>
                {hasCoach
                  ? coachHint
                  : 'Log a check-in to get a tailored tip here.'}
              </Text>
              {hasCoach && (
                <View style={styles.chipsRow}>
                  <Chip text="Make Today concrete" tone="info" />
                  <Chip text="Add acceptance criteria" />
                </View>
              )}
            </GlassCard>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(280).springify()}
            style={styles.quickRow}
          >
            <GlassCard
              title="Quick Join"
              subtitle={todayStandup?.pod ?? 'No upcoming standup'}
              right={<Ionicons name="mic-outline" size={16} color="#fff" />}
              style={styles.quickCard}
            >
              <Text style={styles.quickMeta}>
                {hasCard ? `${timeForDisplay} • 2m each` : '—'}
              </Text>
              <View style={styles.cardFooter}>
                <View {...a11yKillProps}>
                  <Pressable
                    {...a11yKillProps}
                    {...longPressKill}
                    onPress={handleQuickJoin}
                    style={({ pressed }) => [
                      styles.footerBtnPrimary,
                      pressed && canJoin && { opacity: 0.95 },
                      !canJoin && { opacity: 0.6 },
                    ]}
                    disabled={loadingJoin || !canJoin}
                  >
                    <Mic color="#000000" size={16} />
                    <Text
                      selectable={false}
                      style={styles.footerBtnPrimaryText}
                    >
                      {loadingJoin
                        ? 'Joining…'
                        : canJoin
                        ? 'Join'
                        : 'Unavailable'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </GlassCard>

            <GlassCard
              title="New Blocker"
              subtitle="One line is enough"
              right={
                <Ionicons name="help-circle-outline" size={16} color="#fff" />
              }
              style={styles.quickCard}
            >
              <Text style={styles.quickMeta}>We’ll suggest helpers</Text>
              <View style={styles.cardFooter}>
                <View {...a11yKillProps}>
                  <Pressable
                    {...a11yKillProps}
                    {...longPressKill}
                    onPress={() => router.push('/blockers?raise=1')}
                    style={({ pressed }) => [
                      styles.footerBtnSecondary,
                      pressed && { opacity: 0.95 },
                    ]}
                  >
                    <Text
                      selectable={false}
                      style={styles.footerBtnSecondaryText}
                    >
                      Raise
                    </Text>
                  </Pressable>
                </View>
              </View>
            </GlassCard>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(320).springify()}
            style={styles.cardContainer}
          >
            <GlassCard
              title="Your Pod"
              subtitle={`${podSnapshot.name} • ${podSnapshot.tz}`}
            >
              <View style={styles.podTopRow}>
                <View style={styles.podAvatars}>
                  <AvatarStack urls={podSnapshot.members} />
                </View>
                <View style={styles.podStatsRow}>
                  <StatPill
                    icon="flame"
                    value={user.streak}
                    label="day streak"
                  />
                  <StatPill
                    icon="people"
                    value={counts.podMembers}
                    label="members"
                  />
                </View>
              </View>
              <View style={styles.chipsRow}>
                {podSnapshot.tags.length ? (
                  podSnapshot.tags.map((t) => <Chip key={t} text={t} />)
                ) : (
                  <Chip text="#getting-started" />
                )}
              </View>
            </GlassCard>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(360).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Clock color="#ffffff" size={20} />
                    <Text style={styles.cardTitle}>Next Standup</Text>
                  </View>
                  <Animated.View style={pulseStyle}>
                    <View style={styles.liveIndicator} />
                  </Animated.View>
                </View>

                <Text style={styles.podName}>
                  {hasCard ? todayStandup!.pod : 'No upcoming standups'}
                </Text>

                {hasCard && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.standupTime}>
                      {timeForDisplay} • 15 min
                    </Text>
                  </View>
                )}

                {hasCard && participants.length > 0 && (
                  <>
                    <View style={styles.membersRow}>
                      {participants.slice(0, 5).map((p, index) => (
                        <Animated.View
                          key={`${p.name}-${index}`}
                          entering={FadeInRight.delay(
                            400 + index * 100
                          ).springify()}
                          style={{ zIndex: 5 - index, marginLeft: index * -8 }}
                        >
                          <View
                            style={[
                              styles.statusRing,
                              { borderColor: statusColor(p.status) },
                            ]}
                          >
                            <View style={styles.memberAvatar}>
                              <Text style={styles.memberInitial}>
                                {p.name?.[0] ?? '?'}
                              </Text>
                            </View>
                          </View>
                        </Animated.View>
                      ))}
                      {participants.length > 5 && (
                        <View style={styles.memberCount}>
                          <Text style={styles.memberCountText}>
                            +{participants.length - 5}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.attendanceMeta}>
                      <Text style={{ color: statusColor('going') }}>
                        {goingCount} going
                      </Text>
                      {maybeCount ? (
                        <Text>
                          {'  •  '}
                          <Text style={{ color: statusColor('maybe') }}>
                            {maybeCount} maybe
                          </Text>
                        </Text>
                      ) : null}
                      {invitedCount ? (
                        <Text>
                          {'  •  '}
                          {invitedCount} invited
                        </Text>
                      ) : null}
                      {declinedCount ? (
                        <Text>
                          {'  •  '}
                          <Text style={{ color: statusColor('declined') }}>
                            {declinedCount} declined
                          </Text>
                        </Text>
                      ) : null}
                    </Text>
                  </>
                )}

                <View {...a11yKillProps}>
                  <Pressable
                    {...a11yKillProps}
                    {...longPressKill}
                    onPress={handleQuickJoin}
                    style={({ pressed }) => [
                      styles.joinButton,
                      pressed && canJoin && { opacity: 0.96 },
                      !canJoin && { opacity: 0.6 },
                    ]}
                    disabled={loadingJoin || !canJoin}
                  >
                    <Mic color="#000000" size={18} />
                    <Text selectable={false} style={styles.joinButtonText}>
                      {loadingJoin
                        ? 'Joining…'
                        : canJoin
                        ? 'Quick Join'
                        : 'Unavailable'}
                    </Text>
                    <ArrowRight color="#000000" size={18} />
                  </Pressable>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(420).springify()}
            style={styles.statsGrid}
          >
            <BlurView intensity={15} style={styles.statGlass}>
              <View style={styles.statCard}>
                <Users color="#ffffff" size={24} />
                <Text style={styles.statNumber}>{counts.podMembers}</Text>
                <Text style={styles.statLabel}>Pod Members</Text>
              </View>
            </BlurView>

            <BlurView intensity={15} style={styles.statGlass}>
              <View style={styles.statCard}>
                <TrendingUp color="#00ff88" size={24} />
                <Text style={styles.statNumber}>{counts.standups}</Text>
                <Text style={styles.statLabel}>Standups</Text>
              </View>
            </BlurView>

            <BlurView intensity={15} style={styles.statGlass}>
              <View style={styles.statCard}>
                <AlertTriangle color="#ff6b6b" size={24} />
                <Text style={styles.statNumber}>{counts.openBlockers}</Text>
                <Text style={styles.statLabel}>Open Blockers</Text>
              </View>
            </BlurView>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(460).springify()}
            style={styles.cardContainer}
          >
            <GlassCard title="Ship Log" subtitle="Summaries from AI Scribe">
              {shipLogPreview.map((e, i) => (
                <View key={`${e.who}-${i}`} style={styles.logRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logWho}>{e.who}</Text>
                    <Text style={styles.logLine}>
                      • Yesterday: {e.y.join(', ')}
                    </Text>
                    <Text style={styles.logLine}>
                      • Today: {e.t.join(', ')}
                    </Text>
                    {e.b.length ? (
                      <Text style={styles.logBlocker}>
                        • Blockers: {e.b.join(', ')}
                      </Text>
                    ) : null}
                    <View style={styles.chipsRow}>
                      {e.tags.map((t) => (
                        <Chip key={t} text={`#${t.replace(/^#*/, '')}`} />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.logAgo}>{e.ago}</Text>
                </View>
              ))}
            </GlassCard>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(500).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={20} style={styles.cardGlass}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Calendar color="#ffffff" size={20} />
                    <Text style={styles.cardTitle}>Recent Activity</Text>
                  </View>
                </View>

                {recentActivities.map((activity, index) => (
                  <Animated.View
                    key={`${activity.type}-${index}`}
                    entering={FadeInDown.delay(600 + index * 100).springify()}
                    style={styles.activityItem}
                  >
                    <View style={styles.activityDot} />
                    <View style={styles.activityContent}>
                      <Text style={styles.activityText}>
                        {activity.type === 'standup'
                          ? `Standup completed in ${activity.pod}`
                          : `New blocker: ${activity.title ?? ''}`}
                      </Text>
                      <Text style={styles.activityTime}>{activity.time}</Text>
                    </View>
                  </Animated.View>
                ))}
              </View>
            </BlurView>
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
  header: { marginBottom: 24 },
  greeting: { fontSize: 16, fontFamily: 'Inter-Regular', color: '#999999' },
  username: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 8,
  },
  streakContainer: { flexDirection: 'row', alignItems: 'center' },
  streakText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    marginLeft: 6,
  },
  cardContainer: { marginBottom: 20 },
  cardGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  card: { padding: 24 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff88',
  },
  podName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 4,
  },
  standupTime: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#999999' },
  tzToggleRow: {
    flexDirection: 'row',
    gap: 8 as any,
    marginTop: 4,
    marginBottom: 6,
  },
  tzChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tzChipActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  tzChipText: { color: '#cfcfcf', fontSize: 11, fontFamily: 'Inter-Medium' },
  tzChipTextActive: { color: '#000000' },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  statusRing: {
    padding: 2,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInitial: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  memberCount: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  memberCountText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#999999',
  },
  attendanceMeta: { color: '#a8a8a8', fontSize: 12, marginBottom: 20 },
  joinButton: {
    minHeight: 48,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  joinButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginHorizontal: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statGlass: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statCard: { padding: 20, alignItems: 'center' },
  statNumber: {
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999999',
    marginTop: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    marginRight: 16,
  },
  activityContent: { flex: 1 },
  activityText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    marginBottom: 2,
  },
  activityTime: { fontSize: 12, fontFamily: 'Inter-Regular', color: '#666666' },
  coachText: { color: '#cfcfcf' },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6 as any,
  },
  quickRow: { flexDirection: 'row', gap: 10 as any, marginBottom: 12 },
  quickCard: { flex: 1 },
  quickRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickMeta: { color: '#a8a8a8' },
  cardFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footerBtnPrimary: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
  },
  footerBtnPrimaryText: { color: '#000', fontWeight: '700' },
  footerBtnSecondary: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  podTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8 as any,
  },
  podAvatars: { flexShrink: 0 },
  podStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8 as any,
    flexShrink: 1,
    maxWidth: '65%',
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
  },

  logWho: { color: '#fff', fontWeight: '700', marginBottom: 4 },
  logLine: { color: '#bdbdbd' },
  logBlocker: { color: '#ffb4b4' },
  logAgo: { color: '#a8a8a8', marginLeft: 12 },
});
  

