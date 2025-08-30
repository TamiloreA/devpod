import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring
} from 'react-native-reanimated';
import {
  Users,
  Clock,
  Mic,
  Settings,
  MapPin,
  Star,
  ArrowRight,
  UserPlus,
  Share2,
  LogOut
} from 'lucide-react-native';
import Chip from '@/components/ui/Chip';

const { width } = Dimensions.get('window');

export default function PodsScreen() {
  const [selectedPod] = useState(null);
  const buttonScale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleJoinStandup = () => {
    buttonScale.value = withSpring(0.95, { duration: 100 }, () => {
      buttonScale.value = withSpring(1);
    });
  };

  const currentPod = {
    id: '1',
    name: 'React Natives',
    description: 'Mobile developers building with React Native and Expo',
    members: [
      { name: 'Alex Chen', level: 'Senior', avatar: 'AC', online: true },
      { name: 'Sam Rodriguez', level: 'Mid', avatar: 'SR', online: true },
      { name: 'Jordan Kim', level: 'Junior', avatar: 'JK', online: false },
      { name: 'Casey Taylor', level: 'Senior', avatar: 'CT', online: true },
    ],
    timezone: 'PST',
    nextStandup: '9:00 AM',
    streak: 12,
    tags: ['#reactnative', '#expo', '#mobile', '#perf']
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Senior': return '#00ff88';
      case 'Mid': return '#ffaa00';
      case 'Junior': return '#6699ff';
      default: return '#ffffff';
    }
  };

  const onlineCount = currentPod.members.filter(m => m.online).length;

  const week = [
    { d: 'Mon', t: '9:00' },
    { d: 'Tue', t: '9:00' },
    { d: 'Wed', t: '9:00' },
    { d: 'Thu', t: '9:00' },
    { d: 'Fri', t: '9:00' },
  ];

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
            <Text style={styles.title}>Your Pod</Text>
            <TouchableOpacity style={styles.settingsButton}>
              <Settings color="#ffffff" size={20} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            style={styles.cardContainer}
          >
            <BlurView intensity={25} style={styles.podCardGlass}>
              <View style={styles.podCard}>
                <View style={styles.podHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.podName}>{currentPod.name}</Text>
                    <Text style={styles.podDescription}>{currentPod.description}</Text>

                    <View style={styles.tagsRow}>
                      {currentPod.tags.map(t => (
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
                  {week.map(w => (
                    <View key={w.d} style={styles.weekChip}>
                      <Text style={styles.weekDay}>{w.d}</Text>
                      <Text style={styles.weekTime}>{w.t}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.nextStandupContainer}>
                  <View style={styles.nextStandupHeader}>
                    <Clock color="#ffffff" size={18} />
                    <Text style={styles.nextStandupTitle}>Next Standup</Text>
                  </View>
                  <Text style={styles.nextStandupTime}>{currentPod.nextStandup} {currentPod.timezone}</Text>
                </View>

                <View style={styles.membersSection}>
                  <Text style={styles.membersTitle}>Members ({currentPod.members.length})</Text>
                  {currentPod.members.map((member, index) => (
                    <Animated.View
                      key={member.name}
                      entering={FadeInDown.delay(400 + index * 100).springify()}
                      style={styles.memberRow}
                    >
                      <View style={styles.memberInfo}>
                        <View style={styles.memberAvatarLarge}>
                          <Text style={styles.memberInitialLarge}>{member.avatar}</Text>
                        </View>
                        <View style={styles.memberDetails}>
                          <Text style={styles.memberName}>{member.name}</Text>
                          <View style={styles.memberMeta}>
                            <View style={[styles.levelBadge, { backgroundColor: getLevelColor(member.level) + '20' }]}>
                              <Text style={[styles.levelText, { color: getLevelColor(member.level) }]}>
                                {member.level}
                              </Text>
                            </View>
                            <View style={[
                              styles.onlineStatus,
                              { backgroundColor: member.online ? '#00ff88' : '#666666' }
                            ]} />
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  ))}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable style={styles.actionBtn}>
                    <UserPlus size={16} color="#000" />
                    <Text style={styles.actionBtnText}>Invite</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnSecondary}>
                    <Share2 size={16} color="#fff" />
                    <Text style={styles.actionBtnSecondaryText}>Share</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtnDanger}>
                    <LogOut size={16} color="#111" />
                    <Text style={styles.actionBtnDangerText}>Leave</Text>
                  </Pressable>
                </View>

                <Animated.View style={buttonAnimatedStyle}>
                  <TouchableOpacity
                    style={styles.standupButton}
                    onPress={handleJoinStandup}
                    activeOpacity={0.8}
                  >
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
    marginBottom: 32,
  },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  settingsButton: { padding: 8 },

  cardContainer: { marginBottom: 20 },
  podCardGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  podCard: { padding: 24 },

  podHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  podName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 4,
  },
  podDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#999999',
    marginBottom: 10,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any },

  podStats: { alignItems: 'flex-end', gap: 6 as any },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    marginLeft: 4,
  },

  weekRow: {
    flexDirection: 'row',
    gap: 8 as any,
    marginTop: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  weekChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  weekDay: { color: '#cfcfcf', fontSize: 11, marginBottom: 2 },
  weekTime: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Medium' },

  nextStandupContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  nextStandupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nextStandupTitle: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#ffffff', marginLeft: 8 },
  nextStandupTime: { fontSize: 18, fontFamily: 'Inter-SemiBold', color: '#ffffff' },

  membersSection: { marginBottom: 16 },
  membersTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#ffffff', marginBottom: 12 },
  memberRow: { marginBottom: 12 },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  memberAvatarLarge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  memberInitialLarge: { fontSize: 14, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  memberDetails: { flex: 1 },
  memberName: { fontSize: 16, fontFamily: 'Inter-Medium', color: '#ffffff', marginBottom: 4 },
  memberMeta: { flexDirection: 'row', alignItems: 'center' },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
  levelText: { fontSize: 10, fontFamily: 'Inter-SemiBold' },
  onlineStatus: { width: 8, height: 8, borderRadius: 4 },

  actionsRow: {
    flexDirection: 'row',
    gap: 8 as any,
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6 as any,
  },
  actionBtnText: { color: '#000', fontWeight: '700' },

  actionBtnSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6 as any,
  },
  actionBtnSecondaryText: { color: '#fff', fontWeight: '700' },

  actionBtnDanger: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#ffdbdb',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6 as any,
  },
  actionBtnDangerText: { color: '#111', fontWeight: '800' },

  standupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  standupButtonText: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#000000', marginHorizontal: 8 },
});
