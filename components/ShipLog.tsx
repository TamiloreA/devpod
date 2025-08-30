import React from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeInDown, 
  FadeInLeft 
} from 'react-native-reanimated';
import { Calendar, Clock, User, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Target } from 'lucide-react-native';

export default function ShipLog() {
  const logEntries = [
    {
      id: '1',
      date: 'Today',
      type: 'standup',
      speaker: 'Sarah Johnson',
      content: {
        yesterday: ['Completed user auth flow', 'Fixed navigation bug in iOS'],
        today: ['Implement push notifications', 'Review Alex\'s PR for image upload'],
        blockers: ['Need help with LiveKit integration']
      },
      tags: ['React Native', 'Auth', 'Navigation'],
      nextAction: 'Schedule LiveKit integration session'
    },
    {
      id: '2',
      date: 'Today',
      type: 'standup',
      speaker: 'Alex Chen',
      content: {
        yesterday: ['Database schema updates', 'Started image upload feature'],
        today: ['Complete image upload', 'Test on Android'],
        blockers: []
      },
      tags: ['Backend', 'Database', 'File Upload'],
      nextAction: 'Deploy image upload to staging'
    },
    {
      id: '3',
      date: 'Yesterday',
      type: 'standup',
      speaker: 'Sam Rodriguez',
      content: {
        yesterday: ['UI component library setup'],
        today: ['Design system documentation'],
        blockers: ['Figma access needed']
      },
      tags: ['Design System', 'UI/UX'],
      nextAction: 'Request Figma team access'
    }
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'standup': return <User color="#ffffff" size={16} />;
      case 'blocker': return <AlertTriangle color="#ff6b6b" size={16} />;
      case 'help': return <CheckCircle color="#00ff88" size={16} />;
      default: return <Clock color="#ffffff" size={16} />;
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
          {/* Header */}
          <Animated.View 
            entering={FadeInDown.delay(200).springify()}
            style={styles.header}
          >
            <Calendar color="#ffffff" size={24} />
            <Text style={styles.title}>Ship Log</Text>
          </Animated.View>

          {/* Timeline */}
          <View style={styles.timeline}>
            {logEntries.map((entry, index) => (
              <Animated.View 
                key={entry.id}
                entering={FadeInDown.delay(300 + index * 100).springify()}
                style={styles.timelineItem}
              >
                <View style={styles.timelineMarker}>
                  <View style={styles.timelineDot} />
                  {index < logEntries.length - 1 && <View style={styles.timelineLine} />}
                </View>
                
                <Animated.View 
                  entering={FadeInLeft.delay(400 + index * 100).springify()}
                  style={styles.entryContainer}
                >
                  <BlurView intensity={20} style={styles.entryGlass}>
                    <View style={styles.entry}>
                      <View style={styles.entryHeader}>
                        <View style={styles.entryMeta}>
                          {getTypeIcon(entry.type)}
                          <Text style={styles.entrySpeaker}>{entry.speaker}</Text>
                        </View>
                        <Text style={styles.entryDate}>{entry.date}</Text>
                      </View>

                      {/* Standup Content */}
                      {entry.type === 'standup' && (
                        <View style={styles.standupContent}>
                          {entry.content.yesterday.length > 0 && (
                            <View style={styles.standupSection}>
                              <Text style={styles.standupSectionTitle}>Yesterday</Text>
                              {entry.content.yesterday.map((item, itemIndex) => (
                                <View key={itemIndex} style={styles.standupItem}>
                                  <CheckCircle color="#00ff88" size={12} />
                                  <Text style={styles.standupItemText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {entry.content.today.length > 0 && (
                            <View style={styles.standupSection}>
                              <Text style={styles.standupSectionTitle}>Today</Text>
                              {entry.content.today.map((item, itemIndex) => (
                                <View key={itemIndex} style={styles.standupItem}>
                                  <Target color="#ffaa00" size={12} />
                                  <Text style={styles.standupItemText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {entry.content.blockers.length > 0 && (
                            <View style={styles.standupSection}>
                              <Text style={styles.standupSectionTitle}>Blockers</Text>
                              {entry.content.blockers.map((item, itemIndex) => (
                                <View key={itemIndex} style={styles.standupItem}>
                                  <AlertTriangle color="#ff6b6b" size={12} />
                                  <Text style={styles.standupItemText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      )}

                      {/* Tags */}
                      <View style={styles.tagsContainer}>
                        {entry.tags.map((tag, tagIndex) => (
                          <View key={tagIndex} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Next Action */}
                      {entry.nextAction && (
                        <View style={styles.nextActionContainer}>
                          <Text style={styles.nextActionLabel}>Next Action:</Text>
                          <Text style={styles.nextActionText}>{entry.nextAction}</Text>
                        </View>
                      )}
                    </View>
                  </BlurView>
                </Animated.View>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 12,
  },
  timeline: {
    flex: 1,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  timelineMarker: {
    alignItems: 'center',
    marginRight: 16,
    width: 20,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginTop: 8,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginTop: 8,
  },
  entryContainer: {
    flex: 1,
  },
  entryGlass: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  entry: {
    padding: 16,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entrySpeaker: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },
  entryDate: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666666',
  },
  standupContent: {
    marginBottom: 16,
  },
  standupSection: {
    marginBottom: 12,
  },
  standupSectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  standupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  standupItemText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#cccccc',
    marginLeft: 8,
    flex: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  tag: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  nextActionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ffaa00',
  },
  nextActionLabel: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#ffaa00',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextActionText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
  },
});