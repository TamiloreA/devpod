// app/_layout.tsx
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

// Safely register LiveKit globals only in a dev build (Expo Go will skip this)
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebRTC = require('react-native-webrtc');
    const {
      RTCPeerConnection,
      RTCSessionDescription,
      RTCIceCandidate,
      MediaStream,
      MediaStreamTrack,
      mediaDevices,
    } = WebRTC;

    (globalThis as any).RTCPeerConnection = RTCPeerConnection;
    (globalThis as any).RTCSessionDescription = RTCSessionDescription;
    (globalThis as any).RTCIceCandidate = RTCIceCandidate;
    (globalThis as any).MediaStream = MediaStream;
    (globalThis as any).MediaStreamTrack = MediaStreamTrack;
    (globalThis as any).navigator = (globalThis as any).navigator || {};
    (globalThis as any).navigator.mediaDevices = mediaDevices;
  } catch (e) {
    console.warn(
      '[webrtc] RN WebRTC not linked (likely Expo Go). Build & open a dev build to enable WebRTC.'
    );
  }
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded && authChecked) SplashScreen.hideAsync();
  }, [fontsLoaded, authChecked]);

  if (!fontsLoaded || !authChecked) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        ) : (
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        )}
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" backgroundColor="#000000" />
    </>
  );
}
