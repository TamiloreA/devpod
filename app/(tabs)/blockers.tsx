import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Dimensions,
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
import {
  Plus,
  Clock,
  X,
  Send,
  Lightbulb,
  MessageSquare,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

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

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open':
      return '#ff6b6b';
    case 'helping':
      return '#ffaa00';
    case 'resolved':
      return '#00ff88';
    default:
      return '#ffffff';
  }
};

const getSeverityColor = (sev: 'low' | 'medium' | 'high') => {
  if (sev === 'high') return '#ff6b6b';
  if (sev === 'medium') return '#ffaa00';
  return '#59d985';
};


const initialBlockers = [
  {
    id: '1',
    title: 'Redux state not updating after API call',
    description:
      "Using RTK Query but the UI doesn't reflect changes immediately",
    tags: ['Redux', 'RTK Query', 'React Native'],
    timestamp: '2 hours ago',
    status: 'open',
    severity: 'medium' as const,
    attachments: ['screenshot.png', 'PR#342'],
    helpers: [
      { name: 'Alex Chen', level: 'Senior', match: 95 },
      { name: 'Jordan Kim', level: 'Mid', match: 87 },
      { name: 'Sam Rodriguez', level: 'Senior', match: 82 },
    ],
  },
  {
    id: '2',
    title: 'Navigation performance issue with deep nesting',
    description:
      'App becomes slow when navigating through multiple stack screens',
    tags: ['Navigation', 'Performance', 'Expo Router'],
    timestamp: '1 day ago',
    status: 'helping',
    severity: 'high' as const,
    attachments: ['profile.trace'],
    currentHelper: 'Morgan Davis',
  },
];


export default function BlockersScreen() {
  const [blockers, setBlockers] = useState(initialBlockers);
  const [statusFilter, setStatusFilter] =
    useState<'all' | 'open' | 'helping' | 'resolved'>('all');
  const [q, setQ] = useState('');

  const [composeText, setComposeText] = useState('');
  const [triage, setTriage] = useState<{
    severity: 'low' | 'medium' | 'high';
    tags: string[];
    note: string;
  } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blockerText, setBlockerText] = useState('');

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleCreateBlocker = () => {
    buttonScale.value = withSpring(0.95, { duration: 100 }, () => {
      buttonScale.value = withSpring(1);
    });

    if (blockerText.trim()) {
      const newItem = {
        id: String(Date.now()),
        title: blockerText.split('\n')[0].slice(0, 60) || 'New blocker',
        description: blockerText,
        tags: triage?.tags?.length ? triage.tags : ['Uncategorized'],
        timestamp: 'just now',
        status: 'open',
        severity: triage?.severity || 'low',
        attachments: [],
        helpers: [
          { name: 'Alex Chen', level: 'Senior', match: 92 },
          { name: 'Jordan Kim', level: 'Mid', match: 84 },
        ],
      } as any;
      setBlockers((prev) => [newItem, ...prev]);
    }

    setShowCreateModal(false);
    setBlockerText('');
    setComposeText('');
    setTriage(null);
  };

  const runTriage = (text: string) => {
    const lower = text.toLowerCase();
    const severity: 'low' | 'medium' | 'high' =
      lower.includes('crash') || lower.includes('freeze')
        ? 'high'
        : lower.includes('perf') || lower.includes('slow')
        ? 'medium'
        : 'low';
    const tags = [
      lower.includes('redux') && 'Redux',
      lower.includes('rtk') && 'RTK Query',
      lower.includes('navigation') && 'Navigation',
      lower.includes('expo') && 'Expo',
      lower.includes('ios') && 'iOS',
      lower.includes('android') && 'Android',
    ].filter(Boolean) as string[];
    setTriage({
      severity,
      tags: tags.length ? tags : ['General'],
      note:
        severity === 'high'
          ? 'Looks urgent. Consider isolating a repro and capturing a performance trace.'
          : severity === 'medium'
          ? 'Might be caching/state related. Try invalidation / memoization checks.'
          : 'Start with a minimal repro and confirm expected behavior.',
    });
  };

  const openModalPrefilled = () => {
    setBlockerText(composeText);
    setShowCreateModal(true);
  };

  const filtered = useMemo(
    () =>
      blockers.filter(
        (b) =>
          (statusFilter === 'all' || b.status === statusFilter) &&
          (q.trim() === '' ||
            (b.title + b.description + b.tags.join(' '))
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [blockers, statusFilter, q],
  );

  const stats = useMemo(() => {
    const open = blockers.filter((b) => b.status === 'open').length;
    const helping = blockers.filter((b) => b.status === 'helping').length;
    const resolved = blockers.filter((b) => b.status === 'resolved').length;
    return { open, helping, resolved };
  }, [blockers]);

  const markHelping = (id: string) =>
    setBlockers((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'helping' } : b)),
    );
  const resolve = (id: string) =>
    setBlockers((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'resolved' } : b)),
    );

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
            <Text style={styles.title}>Blockers</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateModal(true)}
            >
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
                placeholder="What's blocking you? (one line)"
                placeholderTextColor="#888"
                style={styles.composerInput}
                returnKeyType="send"
                onSubmitEditing={openModalPrefilled}
              />
              <TouchableOpacity style={styles.raiseBtn} onPress={openModalPrefilled}>
                <Text style={styles.raiseBtnText}>Raise</Text>
              </TouchableOpacity>
            </View>

            {triage && (
              <View style={styles.triageRow}>
                <View
                  style={[
                    styles.sevPill,
                    { borderColor: getSeverityColor(triage.severity) },
                  ]}
                >
                  <Text
                    style={[
                      styles.sevPillText,
                      { color: getSeverityColor(triage.severity) },
                    ]}
                  >
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
              <TouchableOpacity
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[styles.seg, statusFilter === s && styles.segActive]}
              >
                <Text
                  style={[
                    styles.segText,
                    statusFilter === s && styles.segTextActive,
                  ]}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </Text>
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

          {filtered.map((blocker, index) => (
            <Animated.View
              key={blocker.id}
              entering={FadeInDown.delay(300 + index * 100).springify()}
              style={styles.cardContainer}
            >
              <BlurView intensity={20} style={styles.cardGlass}>
                <View style={styles.blockerCard}>
                  <View style={styles.blockerHeader}>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: getStatusColor(blocker.status) },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        {blocker.status === 'open' && 'Open'}
                        {blocker.status === 'helping' &&
                          `Being helped by ${blocker.currentHelper || '…'}`}
                        {blocker.status === 'resolved' && 'Resolved'}
                      </Text>
                    </View>

                    <View style={styles.timeRow}>
                      <Clock color="#666666" size={14} />
                      <Text style={styles.timestamp}>{blocker.timestamp}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View
                      style={[
                        styles.sevPill,
                        { borderColor: getSeverityColor(blocker.severity) },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sevPillText,
                          { color: getSeverityColor(blocker.severity) },
                        ]}
                      >
                        {String(blocker.severity).toUpperCase()}
                      </Text>
                    </View>

                    {Array.isArray(blocker.attachments) &&
                      blocker.attachments.slice(0, 3).map((f) => (
                        <View key={f} style={styles.fileChip}>
                          <Text style={styles.fileChipText}>{f}</Text>
                        </View>
                      ))}
                  </View>

                  <Text style={styles.blockerTitle}>{blocker.title}</Text>
                  <Text style={styles.blockerDescription}>
                    {blocker.description}
                  </Text>

                  {blocker.status === 'open' && (
                    <View style={styles.aiHint}>
                      <Lightbulb size={14} color="#ffd966" />
                      <Text style={styles.aiHintText}>
                        AI suggests: try invalidating RTK Query tags and
                        ensuring components subscribe to the updated selector.
                      </Text>
                    </View>
                  )}

                  <View style={styles.tagsContainer}>
                    {blocker.tags.map((tag, tagIndex) => (
                      <View key={tagIndex} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>

                  {blocker.status === 'open' && (blocker as any).helpers && (
                    <View style={styles.helpersSection}>
                      <Text style={styles.helpersTitle}>Suggested Helpers</Text>
                      {(blocker as any).helpers.slice(0, 2).map(
                        (helper: any, helperIndex: number) => (
                          <Animated.View
                            key={helper.name}
                            entering={SlideInRight.delay(
                              500 + helperIndex * 100,
                            ).springify()}
                            style={styles.helperRow}
                          >
                            <View style={styles.helperInfo}>
                              <View style={styles.helperAvatar}>
                                <Text style={styles.helperInitial}>
                                  {helper.name
                                    .split(' ')
                                    .map((n: string) => n[0])
                                    .join('')}
                                </Text>
                              </View>
                              <View style={styles.helperDetails}>
                                <Text style={styles.helperName}>
                                  {helper.name}
                                </Text>
                                <View style={styles.helperMeta}>
                                  <View
                                    style={[
                                      styles.levelBadgeSmall,
                                      {
                                        backgroundColor:
                                          getLevelColor(helper.level) + '20',
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.levelTextSmall,
                                        {
                                          color: getLevelColor(helper.level),
                                        },
                                      ]}
                                    >
                                      {helper.level}
                                    </Text>
                                  </View>
                                  <Text style={styles.matchPercent}>
                                    {helper.match}% match
                                  </Text>
                                </View>
                              </View>
                            </View>
                            <TouchableOpacity style={styles.helpButton}>
                              <MessageSquare color="#ffffff" size={16} />
                            </TouchableOpacity>
                          </Animated.View>
                        ),
                      )}
                    </View>
                  )}

                  <View style={styles.cardFooter}>
                    <TouchableOpacity style={styles.footerBtnPrimary}>
                      <MessageSquare size={16} color="#000" />
                      <Text style={styles.footerBtnPrimaryText}>
                        Ask to help
                      </Text>
                    </TouchableOpacity>
                    {blocker.status !== 'helping' && blocker.status !== 'resolved' && (
                      <TouchableOpacity
                        style={styles.footerBtnSecondary}
                        onPress={() => markHelping(blocker.id)}
                      >
                        <Text style={styles.footerBtnSecondaryText}>
                          Mark helping
                        </Text>
                      </TouchableOpacity>
                    )}
                    {blocker.status !== 'resolved' && (
                      <TouchableOpacity
                        style={styles.footerBtnDanger}
                        onPress={() => resolve(blocker.id)}
                      >
                        <Text style={styles.footerBtnDangerText}>Resolve</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </BlurView>
            </Animated.View>
          ))}
        </ScrollView>

        <Modal
          visible={showCreateModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowCreateModal(false)}
        >
          <BlurView intensity={40} style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInUp.springify()}
              style={styles.modalContainer}
            >
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Lightbulb color="#ffffff" size={20} />
                      <Text style={styles.modalTitle}>Describe Your Blocker</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => setShowCreateModal(false)}
                    >
                      <X color="#ffffff" size={20} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.blockerInput}
                    placeholder="What's blocking you? Be specific about the tech stack, error messages, or concept you're stuck on..."
                    placeholderTextColor="#666666"
                    value={blockerText}
                    onChangeText={setBlockerText}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                  />

                  {triage && (
                    <View style={[styles.aiHint, { marginTop: 0, marginBottom: 16 }]}>
                      <Lightbulb size={14} color="#ffd966" />
                      <Text style={styles.aiHintText}>{triage.note}</Text>
                    </View>
                  )}

                  <Animated.View style={buttonAnimatedStyle}>
                    <TouchableOpacity
                      style={styles.createButton}
                      onPress={handleCreateBlocker}
                      activeOpacity={0.8}
                    >
                      <Send color="#000000" size={18} />
                      <Text style={styles.createButtonText}>Find Helpers</Text>
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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  statsStrip: { flexDirection: 'row', gap: 8 as any, marginBottom: 12 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statChipText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  composerGlass: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    marginBottom: 14,
  },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 as any },
  composerInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    color: '#fff',
    fontFamily: 'Inter-Regular',
  },
  raiseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  raiseBtnText: { color: '#000', fontWeight: '700' },
  triageRow: { marginTop: 10 },
  sevPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 8,
  },
  sevPillText: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.4 },
  triageTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any, marginBottom: 6 },
  triageTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  triageTagText: { color: '#ddd', fontSize: 10 },
  triageNote: { color: '#cfcfcf', fontSize: 12, lineHeight: 18 },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
    marginBottom: 12,
  },
  seg: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  segActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  segText: { color: '#bbb', fontFamily: 'Inter-Medium', fontSize: 12 },
  segTextActive: { color: '#fff' },
  search: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    minWidth: 110,
  },

  cardContainer: { marginBottom: 20 },
  cardGlass: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blockerCard: { padding: 20 },
  blockerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#ffffff' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    marginLeft: 4,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
    marginBottom: 8,
  },
  fileChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fileChipText: { color: '#ddd', fontSize: 10 },

  blockerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 8,
  },
  blockerDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#cccccc',
    lineHeight: 20,
    marginBottom: 12,
  },

  aiHint: {
    flexDirection: 'row',
    gap: 8 as any,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,217,102,0.08)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,217,102,0.25)',
    marginBottom: 12,
  },
  aiHintText: { color: '#f5f0dc', flex: 1, fontSize: 12, lineHeight: 18 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  tag: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 4,
  },
  tagText: { fontSize: 10, fontFamily: 'Inter-Medium', color: '#ffffff' },

  helpersSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  helpersTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 12,
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  helperInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  helperAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  helperInitial: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  helperDetails: { flex: 1 },
  helperName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    marginBottom: 2,
  },
  helperMeta: { flexDirection: 'row', alignItems: 'center' },
  levelBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  levelTextSmall: { fontSize: 8, fontFamily: 'Inter-SemiBold' },
  matchPercent: { fontSize: 10, fontFamily: 'Inter-Regular', color: '#999999' },
  helpButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardFooter: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    gap: 8 as any,
  },
  footerBtnPrimary: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6 as any,
  },
  footerBtnPrimaryText: { color: '#000', fontWeight: '700' },
  footerBtnSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  footerBtnDanger: {
    flexBasis: 96,
    borderRadius: 12,
    backgroundColor: '#ffdbdb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  footerBtnDangerText: { color: '#111', fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: { width: width - 40, maxHeight: height * 0.8 },
  modalGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modal: { padding: 24 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockerInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    minHeight: 120,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginLeft: 8,
  },
});
