// hooks/useJiraConnected.ts
import { useEffect, useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";

export function useJiraConnected() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [channelJoined, setChannelJoined] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      setUid(userId);
      if (!userId) {
        setConnected(false);
        return;
      }
      const { data, error } = await supabase
        .from("external_connections")
        .select("provider, expires_at")
        .eq("provider", "jira")
        .eq("user_id", userId)
        .limit(1);

      if (error) throw error;

      const row = data?.[0];
      if (!row) {
        setConnected(false);
        return;
      }
      // if it has an expires_at in the future, great; otherwise just treat as connected
      const ok =
        !row.expires_at ||
        (typeof row.expires_at === "string" &&
          Date.parse(row.expires_at) > Date.now() - 60_000);
      setConnected(!!ok);
    } catch {
      setConnected(false);
    }
  }, []);

  // initial + on focus
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus])
  );

  // realtime: flip immediately when the connection row changes
  useEffect(() => {
    if (!uid || channelJoined) return;

    const ch = supabase
      .channel(`extconn:jira:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_connections",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row || row.provider !== "jira") return;
          // Re-check from DB (keeps logic in one place)
          fetchStatus();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setChannelJoined(true);
      });

    return () => {
      ch.unsubscribe();
      setChannelJoined(false);
    };
  }, [uid, channelJoined, fetchStatus]);

  return connected; // null = loading; boolean afterwards
}
