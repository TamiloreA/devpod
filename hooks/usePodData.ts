import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

export type PodUIData = {
  podId: string;
  name: string;
  description?: string | null;
  timezone: string;
  streak: number;
  /** e.g. "Mon 9:30 AM" (real standup if present, else computed from week_schedule) */
  nextStandupTime?: string | null;
  tags: string[];
  members: { id: string; name: string; initials: string; level?: string | null; online?: boolean }[];
  /** UI-friendly week chips rendered from week_schedule */
  weekSchedule: { d: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; times: string[] }[];
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

// "YYYY-MM-DD" day key evaluated in a timezone
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

// ---- Week schedule helpers
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

/** Helpers to compute "next from schedule" in a timezone */
const weekdayIndexInTZ = (d: Date, tz: string) => {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? d.getUTCDay();
};
const minutesSinceMidnightInTZ = (d: Date, tz: string) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .split(':')
    .map((v) => parseInt(v, 10));
  return h * 60 + m;
};
const hmToMinutes = (hm: string) => {
  const [h, m = '0'] = hm.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};
/** Returns a label like "Mon 9:30 AM" or null if schedule empty */
function nextFromWeekSchedule(schedule: WeekScheduleJSON | null | undefined, tz: string): string | null {
  if (!schedule) return null;

  // Ensure arrays & sort each day's times
  const norm: Record<string, string[]> = {};
  for (const k of DOW_ORDER) {
    norm[k] = (schedule[k] ?? [])
      .map((e) => e?.time)
      .filter(Boolean) as string[];
    norm[k].sort((a, b) => hmToMinutes(a) - hmToMinutes(b));
  }

  const now = new Date();
  const todayIdx = weekdayIndexInTZ(now, tz);
  const nowMins = minutesSinceMidnightInTZ(now, tz);

  // Scan next 7 days
  for (let off = 0; off < 7; off++) {
    const idx = (todayIdx + off) % 7;
    const dow = DOW_ORDER[idx];
    const times = norm[dow];
    if (!times.length) continue;

    for (const t of times) {
      const mins = hmToMinutes(t);
      if (off === 0 && mins <= nowMins) continue; // already passed today
      return `${DOW_LABEL[dow]} ${fmtHHMM12(t)}`;
    }
  }
  return null;
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

      // Load primary pod + pod details (including week_schedule JSON)
      const { data: pmRow, error: pmErr } = await supabase
        .from('pod_members')
        .select('pod_id, is_primary, pods(name, description, timezone, week_schedule)')
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
      const weekScheduleJSON = ((pmRow as any)?.pods?.week_schedule ?? null) as WeekScheduleJSON;
      const weekSchedule = toUIWeek(weekScheduleJSON);

      // Member IDs
      const { data: memberIdsRows, error: idsErr } = await supabase
        .from('pod_members')
        .select('user_id')
        .eq('pod_id', podId);
      if (idsErr) console.error('pod_members member ids error', idsErr);

      const userIds = (memberIdsRows ?? []).map((r) => r.user_id as string).filter(Boolean);

      // Profiles
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
          online: false, // realtime presence updates below
        })) ?? [];

      // Next standup (pod TZ-aware)
      const { data: next, error: nextErr } = await supabase
        .from('standups')
        .select('id, scheduled_at')
        .eq('pod_id', podId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextErr) console.error('standups select error', nextErr);

      let nextStandupTime: string | null = null;

      if (next?.scheduled_at) {
        // Prefer a real, upcoming standup
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(
          new Date(next.scheduled_at)
        );
        const time = fmtTimeInTZ(next.scheduled_at, tz);
        nextStandupTime = `${weekday} ${time}`;
      } else {
        // Fallback: compute from week_schedule
        nextStandupTime = nextFromWeekSchedule(weekScheduleJSON, tz);
      }

      // Streak (last 30 days)
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

      // Dynamic tags from recent check-ins + blockers
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
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Presence (Realtime)
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

  const create = useCallback(
    async ({ name, description, timezone }: CreateInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');

      // Seed a sensible default Mon–Fri 09:30 schedule
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

  return { data, loading, error, create, leave, reload: load };
}
