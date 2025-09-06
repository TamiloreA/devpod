import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const INVITE_BASE_URL = 'https://app.example.com';
const APP_SCHEME = 'standups';

export type WeekScheduleJSON =
  | {
      mon?: { time: string; duration?: number }[];
      tue?: { time: string; duration?: number }[];
      wed?: { time: string; duration?: number }[];
      thu?: { time: string; duration?: number }[];
      fri?: { time: string; duration?: number }[];
      sat?: { time: string; duration?: number }[];
      sun?: { time: string; duration?: number }[];
    }
  | null;

export type PodSummary = {
  id: string;
  name: string;
  isPrimary: boolean;
  timezone?: string | null;
  description?: string | null;
};

export type PodUIData = {
  podId: string;
  name: string;
  description?: string | null;
  timezone: string;
  streak: number;
  nextStandupTime?: string | null;
  tags: string[];
  members: { id: string; name: string; initials: string; level?: string | null; online?: boolean }[];
  weekSchedule: { d: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; times: string[] }[];
};

type CreateInput = { name: string; description?: string; timezone?: string };
type StandupRow = { id: string; scheduled_at: string };
type CheckinRow = { standup_id: string };

export type InviteLinkResult = {
  code: string;
  url: string;
  deepLink: string;
  expiresAt: string;
  maxUses?: number | null;
};

const toSingle = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v ?? null;

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

const DOW_ORDER: Array<keyof NonNullable<WeekScheduleJSON>> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DOW_LABEL: Record<
  keyof NonNullable<WeekScheduleJSON>,
  'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const fmtHHMM12 = (hhmm?: string | null) => {
  if (!hhmm) return null;
  const [hStr, mStr] = hhmm.split(':');
  const h = Math.max(0, Math.min(23, parseInt(hStr || '0', 10)));
  const m = Math.max(0, Math.min(59, parseInt(mStr || '0', 10)));
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
};

function toUIWeek(
  schedule: WeekScheduleJSON | undefined | null
): { d: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; times: string[] }[] {
  const safe = schedule ?? {};
  return DOW_ORDER.map((key) => {
    const entries = (safe[key] ?? []).filter(Boolean);
    const times = entries.map((e) => fmtHHMM12(e.time) || '—');
    return { d: DOW_LABEL[key], times };
  });
}

const randomCode = (len = 10) => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

type PodRow = {
  id: string;
  name: string | null;
  description: string | null;
  timezone: string | null;
  week_schedule: WeekScheduleJSON;
};

type PodMemberWithPod = {
  pod_id: string;
  is_primary: boolean;
  pods: PodRow | PodRow[] | null; 
};

export function usePodData() {
  const [data, setData] = useState<PodUIData | null>(null);
  const [pods, setPods] = useState<PodSummary[]>([]);
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
        setPods([]);
        setData(null);
        setLoading(false);
        return;
      }

      const { data: memRows, error: memErr } = await supabase
        .from('pod_members')
        .select('pod_id, is_primary, pods(id, name, description, timezone, week_schedule)')
        .eq('user_id', uid)
        .returns<PodMemberWithPod[]>();

      if (memErr) {
        console.error('pod_members select error', memErr);
        setPods([]);
        setData(null);
        setLoading(false);
        return;
      }

      const summaries: PodSummary[] = (memRows ?? []).map((r) => {
        const pod = toSingle(r.pods);
        return {
          id: r.pod_id,
          name: pod?.name ?? 'Pod',
          isPrimary: !!r.is_primary,
          timezone: pod?.timezone ?? 'UTC',
          description: pod?.description ?? null,
        };
      });
      setPods(summaries);

      const active = (memRows ?? []).find((r) => r.is_primary) ?? (memRows ?? [])[0];
      if (!active?.pod_id) {
        setData(null);
        setLoading(false);
        return;
      }

      const pod = toSingle(active.pods);
      const podId = active.pod_id as string;
      const podName = pod?.name ?? '';
      const podDesc = pod?.description ?? null;
      const tz = pod?.timezone ?? 'UTC';
      const weekScheduleJSON = (pod?.week_schedule ?? null) as WeekScheduleJSON;
      const weekSchedule = toUIWeek(weekScheduleJSON);

      const { data: memberIdsRows, error: idsErr } = await supabase
        .from('pod_members')
        .select('user_id')
        .eq('pod_id', podId)
        .returns<{ user_id: string }[]>();
      if (idsErr) console.error('pod_members member ids error', idsErr);

      const userIds = (memberIdsRows ?? []).map((r) => r.user_id).filter(Boolean);

      let profilesRows: { id: string; display_name: string | null; level: string | null }[] = [];
      if (userIds.length) {
        const { data: pRows, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name, level')
          .in('id', userIds)
          .returns<{ id: string; display_name: string | null; level: string | null }[]>();
        if (pErr) console.error('profiles select error', pErr);
        profilesRows = pRows ?? [];
      }

      const members =
        (profilesRows ?? []).map((p) => ({
          id: p.id,
          name: p.display_name || 'Member',
          initials: initials(p.display_name),
          level: p.level ?? null,
          online: false,
        })) ?? [];

      const { data: next, error: nextErr } = await supabase
        .from('standups')
        .select('id, scheduled_at')
        .eq('pod_id', podId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle()
        .returns<StandupRow>();
      if (nextErr) console.error('standups select error', nextErr);
      const nextStandupTime = fmtTimeInTZ(next?.scheduled_at ?? null, tz);

      const sinceISO = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
      const { data: doneStandups, error: sErr } = await supabase
        .from('standups')
        .select('id, scheduled_at')
        .eq('pod_id', podId)
        .eq('status', 'done')
        .gte('scheduled_at', sinceISO)
        .order('scheduled_at', { ascending: false })
        .returns<StandupRow[]>();
      if (sErr) console.error('done standups error', sErr);

      let checkins: CheckinRow[] = [];
      if ((doneStandups ?? []).length) {
        const ids = (doneStandups as StandupRow[]).map((s) => s.id);
        const { data: ciRows, error: cErr } = await supabase
          .from('standup_checkins')
          .select('standup_id')
          .in('standup_id', ids)
          .returns<CheckinRow[]>();
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
        weekSchedule,
      });
    } catch (e: any) {
      console.error('usePodData load error', e);
      setError(e?.message ?? 'Failed to load pod data');
      setPods([]);
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
          ? { ...curr, members: curr.members.map((m) => ({ ...m, online: onlineIds.has(m.id) })) }
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

  const create = useCallback(
    async ({ name, description, timezone }: CreateInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');

      const defaultWeek: WeekScheduleJSON = {
        mon: [{ time: '09:30', duration: 15 }],
        tue: [{ time: '09:30', duration: 15 }],
        wed: [{ time: '09:30', duration: 15 }],
        thu: [{ time: '09:30', duration: 15 }],
        fri: [{ time: '09:30', duration: 15 }],
      };

      const { data: pod, error } = await supabase
        .from('pods')
        .insert([{ name, description, timezone: timezone ?? 'UTC', creator_id: uid, week_schedule: defaultWeek }])
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
    },
    [load]
  );

  const leave = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid || !data?.podId) return;

    await supabase.from('pod_members').delete().eq('pod_id', data.podId).eq('user_id', uid);
    await load();
  }, [data?.podId, load]);

  const setPrimary = useCallback(
    async (podId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');

      await supabase.from('pod_members').update({ is_primary: false }).eq('user_id', uid);
      await supabase.from('pod_members').update({ is_primary: true }).eq('user_id', uid).eq('pod_id', podId);

      await load();
    },
    [load]
  );

  const createInviteLink = useCallback(
    async (opts?: { expiresInHours?: number; maxUses?: number; preferDeepLink?: boolean }): Promise<string> => {
      const podId = data?.podId;
      if (!podId) throw new Error('No pod');

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');

      const expiresInHours = Math.max(1, Math.min(24 * 30, opts?.expiresInHours ?? 72));
      const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
      const code = randomCode(10);
      const maxUses = opts?.maxUses ?? 50;

      const { error: invErr } = await supabase
        .from('pod_invites')
        .insert([{ pod_id: podId, code, created_by: uid, expires_at: expiresAt, max_uses: maxUses }]);

      if (invErr) {
        console.error('pod_invites insert error', invErr);
        return `${INVITE_BASE_URL}/join?podId=${encodeURIComponent(podId)}`;
      }

      const url = `${INVITE_BASE_URL}/join/${code}`;
      const deepLink = `${APP_SCHEME}://join?code=${encodeURIComponent(code)}`;
      return opts?.preferDeepLink ? deepLink : url;
    },
    [data?.podId]
  );

  return {
    data,         
    pods,  
    loading,
    error,
    create,
    leave,
    reload: load,
    setPrimary, 
    createInviteLink,
  };
}
