import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_MS = 60_000;

export function usePresence(session: Session | null) {
  const userId = session?.user?.id ?? null;
  const appState = useRef<AppStateStatus | null>(AppState.currentState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTouchRef = useRef<number>(0);

  async function touch() {
    if (!userId) return;
    // throttle to avoid spamming
    const now = Date.now();
    if (now - lastTouchRef.current < 10_000) return;
    lastTouchRef.current = now;

    try {
      await supabase.rpc('touch_last_seen');
    } catch (e) {
    }
  }

  function startHeartbeat() {
    if (timerRef.current) return;
    timerRef.current = setInterval(touch, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    if (!userId) {
      stopHeartbeat();
      return;
    }

    if (AppState.currentState === 'active') {
      touch();
      startHeartbeat();
    }

    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      if (next === 'active') {
        touch();
        startHeartbeat();
      } else if (prev === 'active' && (next === 'inactive' || next === 'background')) {
        stopHeartbeat();
      }
    });

    return () => {
      sub.remove();
      stopHeartbeat();
    };
  }, [userId]);
}
