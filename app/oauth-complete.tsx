import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

export default function OAuthComplete() {
  const { provider, ok, error } = useLocalSearchParams<{ provider?: string; ok?: string; error?: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace({ pathname: '/(tabs)/profile', params: { refreshConnections: '1' } });
    }, 300);
    return () => clearTimeout(t);
  }, [provider, ok, error]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#fff" />
      <Text style={{ color: '#fff', marginTop: 12 }}>
        {ok === '1' ? `Connected ${provider}…` : `Finishing ${provider}…`}
      </Text>
    </View>
  );
}
