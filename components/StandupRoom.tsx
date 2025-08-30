import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet,
  Dimensions 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeInDown, 
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing
} from 'react-native-reanimated';
import { Mic, MicOff, Users, Clock, SkipForward, CirclePause as PauseCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function StandupRoom() {
  const [isMuted, setIsMuted] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(120); // 2 minutes
  const [currentSpeaker, setCurrentSpeaker] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const micPulse = useSharedValue(1);
  const timerRotation = useSharedValue(0);

  const speakers = [
    { name: 'Sarah Johnson', avatar: 'SJ', isYou: true },
    { name: 'Alex Chen', avatar: 'AC', isYou: false },
    { name: 'Sam Rodriguez', avatar: 'SR', isYou: false },
    { name: 'Jordan Kim', avatar: 'JK', isYou: false },
  ];

  useEffect(() => {
    if (!isMuted && !isPaused) {
      micPulse.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600, easing: Easing.ease }),
          withTiming(1, { duration: 600, easing: Easing.ease })
        ),
        -1,
        true
      );
    } else {
      micPulse.value = withTiming(1);
    }
  }, [isMuted, isPaused]);

  useEffect(() => {
    timerRotation.value = withTiming(360, { duration: timeRemaining * 1000, easing: Easing.linear });
  }, [timeRemaining]);

  const micAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const timerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${timerRotation.value}deg` }],
  }));

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isCurrentSpeaker = speakers[currentSpeaker]?.isYou;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0a0a0a', '#000000']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Header */}
          <Animated.View 
            entering={FadeInDown.delay(200).springify()}
            style={styles.header}
          >
            <Text style={styles.roomTitle}>Daily Standup</Text>
            <Text style={styles.podName}>React Natives</Text>
          </Animated.View>

          {/* Timer */}
          <Animated.View 
            entering={FadeInDown.delay(300).springify()}
            style={styles.timerContainer}
          >
            <BlurView intensity={30} style={styles.timerGlass}>
              <View style={styles.timer}>
                <Animated.View style={[styles.timerRing, timerAnimatedStyle]} />
                <View style={styles.timerCenter}>
                  <Clock color="#ffffff" size={24} />
                  <Text style={styles.timerText}>{formatTime(timeRemaining)}</Text>
                  <Text style={styles.timerLabel}>
                    {isCurrentSpeaker ? 'Your turn' : `${speakers[currentSpeaker]?.name?.split(' ')[0]}'s turn`}
                  </Text>
                </View>
              </View>
            </BlurView>
          </Animated.View>

          {/* Speaker Queue */}
          <Animated.View 
            entering={FadeInDown.delay(400).springify()}
            style={styles.speakersContainer}
          >
            <BlurView intensity={20} style={styles.speakersGlass}>
              <View style={styles.speakers}>
                <View style={styles.speakersHeader}>
                  <Users color="#ffffff" size={18} />
                  <Text style={styles.speakersTitle}>Speaking Order</Text>
                </View>
                {speakers.map((speaker, index) => (
                  <Animated.View 
                    key={speaker.name}
                    entering={FadeInDown.delay(500 + index * 100).springify()}
                    style={[
                      styles.speakerRow,
                      index === currentSpeaker && styles.activeSpeaker,
                      index < currentSpeaker && styles.completedSpeaker
                    ]}
                  >
                    <View style={styles.speakerInfo}>
                      <View style={[
                        styles.speakerAvatar,
                        index === currentSpeaker && styles.activeSpeakerAvatar
                      ]}>
                        <Text style={[
                          styles.speakerInitial,
                          index === currentSpeaker && styles.activeSpeakerText
                        ]}>
                          {speaker.avatar}
                        </Text>
                      </View>
                      <View style={styles.speakerDetails}>
                        <Text style={[
                          styles.speakerName,
                          index < currentSpeaker && styles.completedText
                        ]}>
                          {speaker.name} {speaker.isYou && '(You)'}
                        </Text>
                        <Text style={styles.speakerStatus}>
                          {index < currentSpeaker ? 'Completed' : 
                           index === currentSpeaker ? 'Speaking now' : 'Waiting'}
                        </Text>
                      </View>
                    </View>
                    {index === currentSpeaker && (
                      <View style={styles.speakingIndicator}>
                        <View style={styles.speakingDot} />
                      </View>
                    )}
                  </Animated.View>
                ))}
              </View>
            </BlurView>
          </Animated.View>

          {/* Controls */}
          <Animated.View 
            entering={FadeInDown.delay(600).springify()}
            style={styles.controls}
          >
            {isCurrentSpeaker && (
              <Animated.View style={micAnimatedStyle}>
                <TouchableOpacity 
                  style={[styles.micButton, isMuted ? styles.mutedButton : styles.activeButton]}
                  onPress={toggleMute}
                  activeOpacity={0.8}
                >
                  {isMuted ? (
                    <MicOff color="#ffffff" size={32} />
                  ) : (
                    <Mic color="#000000" size={32} />
                  )}
                </TouchableOpacity>
              </Animated.View>
            )}
            
            <View style={styles.controlButtons}>
              <TouchableOpacity style={styles.controlButton}>
                <PauseCircle color="#ffffff" size={20} />
                <Text style={styles.controlText}>Pause</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.controlButton}>
                <SkipForward color="#ffffff" size={20} />
                <Text style={styles.controlText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
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
  content: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  roomTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#999999',
  },
  podName: {
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginTop: 4,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  timerGlass: {
    borderRadius: 100,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  timer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timerRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#ffffff',
    borderRightColor: 'transparent',
  },
  timerCenter: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginTop: 8,
  },
  timerLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999999',
    marginTop: 4,
  },
  speakersContainer: {
    flex: 1,
    marginBottom: 32,
  },
  speakersGlass: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  speakers: {
    flex: 1,
    padding: 20,
  },
  speakersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  speakersTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },
  speakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  activeSpeaker: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  completedSpeaker: {
    opacity: 0.6,
  },
  speakerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  speakerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activeSpeakerAvatar: {
    backgroundColor: '#ffffff',
  },
  speakerInitial: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  activeSpeakerText: {
    color: '#000000',
  },
  speakerDetails: {
    flex: 1,
  },
  speakerName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  completedText: {
    color: '#666666',
  },
  speakerStatus: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999999',
    marginTop: 2,
  },
  speakingIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff88',
  },
  controls: {
    alignItems: 'center',
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  activeButton: {
    backgroundColor: '#ffffff',
  },
  mutedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    marginLeft: 6,
  },
});