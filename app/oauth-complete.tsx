import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

export default function OAuthComplete() {
  const { provider, ok, error } = useLocalSearchParams<{ provider?: string; ok?: string; error?: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace({ pathname: '/(tabs)/profile', params: { refreshConnections: '1' } });
    }, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={s.c}>
      <ActivityIndicator color="#fff" />
      <Text style={s.t}>
        {ok === '1' ? `Connected ${provider} ✓` : `Failed to connect ${provider}${error ? `: ${error}` : ''}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  t: { color: '#fff', marginTop: 8 },
});
