import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

export default function StandupRoom() {
  const { podId } = useLocalSearchParams<{ podId: string }>();
  return (
    <View style={styles.c}>
      <Text style={styles.h}>Standup Room</Text>
      <Text style={styles.p}>Pod: {podId}</Text>
      <Pressable onPress={() => router.back()} style={styles.b}>
        <Text style={{ fontWeight: '700' }}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  h: { color: '#fff', fontSize: 22, marginBottom: 6 },
  p: { color: '#bbb', marginBottom: 20 },
  b: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});
