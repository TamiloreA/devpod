import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useJiraConnected() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("external_connections")
          .select("id, provider, expires_at, metadata")
          .eq("provider", "jira")
          .limit(1);

        if (error) throw error;
        if (!cancelled) setConnected(!!data?.length);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return connected;
}
