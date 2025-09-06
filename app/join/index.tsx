import * as React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router, type Href } from 'expo-router';

export default function JoinIndexScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const [value, setValue] = React.useState<string>('');

  React.useEffect(() => {
    const raw = Array.isArray(params.code) ? params.code[0] : params.code;
    const c = (raw ?? '').trim();
    if (c) {
      const href = { pathname: '/join/[code]' as const, params: { code: c } } as const;
      router.replace(href as unknown as Href);
    }
  }, [params.code]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Join a Pod</Text>

        <TextInput
          placeholder="Enter invite code"
          placeholderTextColor="#8a8a8a"
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          value={value}
          onChangeText={setValue}
        />

        <Pressable
          style={[styles.cta, { opacity: value.trim() ? 1 : 0.6 }]}
          disabled={!value.trim()}
          onPress={() => {
            const c = value.trim();
            if (!c) return;
            const href = { pathname: '/join/[code]' as const, params: { code: c } } as const;
            router.replace(href as unknown as Href);
          }}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>

        <Pressable
          style={[styles.cta, { backgroundColor: '#ffffff15', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, marginTop: 10 }]}
          onPress={() => router.replace('/')}
        >
          <Text style={[styles.ctaText, { color: '#fff' }]}>Go Home</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 22, color: '#fff', marginBottom: 12, fontWeight: '700' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 12,
  },
  cta: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#000', fontWeight: '800' },
});
