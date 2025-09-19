// hooks/useJiraConnected.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Linking from "expo-linking";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase";

const FUNCTIONS_BASE =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE ||
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

type StatusResp = { connected: boolean };

export function useJiraConnected() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const fetchingRef = useRef(false);

  const refetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) {
        setConnected(false);
        return;
      }
      // Call the secure Edge endpoint (service role reads the table server-side)
      const url = `${FUNCTIONS_BASE}/oauth/status?provider=jira&access_token=${encodeURIComponent(
        jwt
      )}`;
      const r = await fetch(url, { method: "GET" });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const body = (await r.json()) as StatusResp;
      setConnected(!!body.connected);
    } catch (e) {
      // On any error, show disconnected so the button is available
      setConnected(false);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Refresh when app comes back to foreground (after OAuth)
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") refetch();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refetch]);

  // Refresh when a deep link hits (e.g., ...?refreshConnections=1)
  useEffect(() => {
    const sub = Linking.addEventListener("url", (evt) => {
      if (evt?.url && evt.url.includes("refreshConnections=1")) {
        refetch();
      }
    });
    return () => sub.remove();
  }, [refetch]);

  return useMemo(() => ({ connected, refetch }), [connected, refetch]);
}
