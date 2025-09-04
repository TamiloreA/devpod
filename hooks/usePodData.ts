import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PodUIData = {
  podId: string;
  name: string;
  description?: string | null;
  timezone: string;
  streak: number;
  nextStandupTime?: string | null;
  tags: string[];
  members: { id: string; name: string; initials: string; level?: string | null; online?: boolean }[];
};

type CreateInput = { name: string; description?: string; timezone?: string };
type StandupRow = { id: string; scheduled_at: string };
type CheckinRow = { standup_id: string };

const fmtTimeInTZ = (iso?: string | null, tz?: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || undefined,
    });
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
};

const dayKeyInTZ = (iso: string, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso)); 
  } catch {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};

const computePodStreak = (
  doneStandups: StandupRow[],
  checkins: CheckinRow[],
  tz: string,
  minCheckinsPerDay = 1
): number => {
  if (!doneStandups.length) return 0;

  const perStandup = new Map<string, number>();
  for (const c of checkins) perStandup.set(c.standup_id, (perStandup.get(c.standup_id) ?? 0) + 1);

  const goodDays = new Set<string>();
  for (const s of doneStandups) {
    const cnt = perStandup.get(s.id) ?? 0;
    if (cnt >= minCheckinsPerDay) goodDays.add(dayKeyInTZ(s.scheduled_at, tz));
  }
  if (goodDays.size === 0) return 0;

  let streak = 0;
  let cursor = new Date();
  for (;;) {
    const key = dayKeyInTZ(cursor.toISOString(), tz);
    if (!goodDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

const initials = (full?: string | null) =>
  (full ?? '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

function topTags(arrays: (string[] | null | undefined)[], n = 3): string[] {
  const tally = new Map<string, number>();
  for (const tags of arrays) {
    (tags ?? []).forEach((raw) => {
      const t = String(raw).trim().replace(/^#*/, '').toLowerCase();
      if (!t) return;
      tally.set(t, (tally.get(t) ?? 0) + 1);
    });
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => `#${t}`);
}

export function usePodData() {
  const [data, setData] = useState<PodUIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(null);

  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setAuthUid(uid);

      if (!uid) {
        setData(null);
        setLoading(false);
        return;
      }

      const { data: pmRow, error: pmErr } = await supabase
        .from('pod_members')
        .select('pod_id, is_primary, pods(name, description, timezone)')
        .eq('user_id', uid)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pmErr || !pmRow?.pod_id) {
        if (pmErr) console.error('pod_members primary select error', pmErr);
        setData(null);
        setLoading(false);
        return;
      }

      const podId = pmRow.pod_id as string;
      const podName = (pmRow as any)?.pods?.name ?? '';
      const podDesc = (pmRow as any)?.pods?.description ?? null;
      const tz = (pmRow as any)?.pods?.timezone ?? 'UTC';

      const { data: memberIdsRows, error: idsErr } = await supabase
        .from('pod_members')
        .select('user_id')
        .eq('pod_id', podId);
      if (idsErr) console.error('pod_members member ids error', idsErr);

      const userIds = (memberIdsRows ?? []).map((r) => r.user_id as string).filter(Boolean);

      let profilesRows:
        | { id: string; display_name: string | null; level?: string | null }[]
        | null = [];
      if (userIds.length) {
        const { data: pRows, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name, level')
          .in('id', userIds);
        if (pErr) console.error('profiles select error', pErr);
        profilesRows = pRows ?? [];
      }

      const members =
        (profilesRows ?? []).map((p) => ({
          id: p.id,
          name: p.display_name || 'Member',
          initials: initials(p.display_name),
          level: (p as any).level ?? null,
          online: false, 
        })) ?? [];

      const { data: next, error: nextErr } = await supabase
        .from('standups')
        .select('id, scheduled_at')
        .eq('pod_id', podId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextErr) console.error('standups select error', nextErr);
      const nextStandupTime = fmtTimeInTZ(next?.scheduled_at ?? null, tz);

      const sinceISO = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
      const { data: doneStandups, error: sErr } = await supabase
        .from('standups')
        .select('id, scheduled_at')
        .eq('pod_id', podId)
        .eq('status', 'done')
        .gte('scheduled_at', sinceISO)
        .order('scheduled_at', { ascending: false });
      if (sErr) console.error('done standups error', sErr);

      let checkins: CheckinRow[] = [];
      if ((doneStandups ?? []).length) {
        const ids = (doneStandups as StandupRow[]).map((s) => s.id);
        const { data: ciRows, error: cErr } = await supabase
          .from('standup_checkins')
          .select('standup_id')
          .in('standup_id', ids);
        if (cErr) console.error('standup_checkins error', cErr);
        checkins = (ciRows ?? []) as CheckinRow[];
      }

      const streak = computePodStreak((doneStandups ?? []) as StandupRow[], checkins, tz, 1);

      const { data: recentCheckins, error: rcErr } = await supabase
        .from('standup_checkins')
        .select('tags, created_at, standups!inner(pod_id)')
        .eq('standups.pod_id', podId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (rcErr) console.error('recent check-ins error', rcErr);

      const { data: recentBlockers, error: rbErr } = await supabase
        .from('blockers')
        .select('tags, created_at')
        .eq('pod_id', podId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (rbErr) console.error('recent blockers error', rbErr);

      const dynamicTags =
        topTags(
          [
            ...(recentCheckins ?? []).map((r: any) => r.tags as string[] | null),
            ...(recentBlockers ?? []).map((b: any) => b.tags as string[] | null),
          ],
          3
        ) || ['#getting-started'];

      setData({
        podId,
        name: podName,
        description: podDesc,
        timezone: tz,
        streak,
        nextStandupTime,
        tags: dynamicTags,
        members,
      });
    } catch (e: any) {
      console.error('usePodData load error', e);
      setError(e?.message ?? 'Failed to load pod data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
    }

    const podId = data?.podId;
    const uid = authUid;
    if (!podId || !uid) return;

    const channel = supabase.channel(`pod-presence:${podId}`, {
      config: { presence: { key: uid } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, any[]>;
      const onlineIds = new Set(Object.keys(state)); 

      setData((curr) =>
        curr
          ? {
              ...curr,
              members: curr.members.map((m) => ({
                ...m,
                online: onlineIds.has(m.id),
              })),
            }
          : curr
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({
          user_id: uid,
          pod_id: podId,
          online_at: new Date().toISOString(),
        });
      }
    });

    presenceChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      presenceChannelRef.current = null;
    };
  }, [data?.podId, authUid]);

  const create = useCallback(async ({ name, description, timezone }: CreateInput) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Not signed in');

    const { data: pod, error } = await supabase
      .from('pods')
      .insert([{ name, description, timezone: timezone ?? 'UTC', creator_id: uid }])
      .select('id, name, description, timezone')
      .single();
    if (error) {
      console.error('pods insert error', error);
      throw error;
    }

    const { error: mErr } = await supabase
      .from('pod_members')
      .insert([{ pod_id: pod.id, user_id: uid, is_primary: true, role: 'owner' }]);
    if (mErr) {
      console.error('pod_members insert error', mErr);
      throw mErr;
    }

    await load();
  }, [load]);

  const leave = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid || !data?.podId) return;

    await supabase.from('pod_members').delete().eq('pod_id', data.podId).eq('user_id', uid);
    await load();
  }, [data?.podId, load]);

  return { data, loading, error, create, leave, reload: load };
}
