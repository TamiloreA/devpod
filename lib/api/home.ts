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

export type HomeData = {
  user: { name: string; streak: number };
  todayStandup: {
    standupId: string;          
    joinable: boolean;           
    isFromWeekSchedule?: boolean;

    podId: string;
    pod: string;

    scheduledAtISO: string;      

    timePod: string;
    podTz: string;
    podTzAbbr: string;

    timeLocal: string;
    localTzAbbr: string;

    participants?: {
      name: string;
      avatarUrl?: string | null;
      status: 'invited' | 'going' | 'maybe' | 'declined' | 'checked_in';
    }[];
  } | null;
  coachHint: string;
  podSnapshot: { name: string; tz: string; tags: string[]; members: string[] };
  shipLogPreview: {
    who: string; y: string[]; t: string[]; b: string[]; tags: string[]; ago: string;
  }[];
  recentActivities: { type: 'standup' | 'blocker'; pod: string; title?: string; time: string }[];
  counts: { podMembers: number; standups: number; openBlockers: number };
};

function fmtInTz(iso: string, timeZone: string, opts?: Intl.DateTimeFormatOptions): string {
  try {
    const o: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...opts, timeZone };
    return new Intl.DateTimeFormat(undefined, o).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

function tzAbbr(iso: string, timeZone: string): string {
  try {
    const dtf = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    });
    const parts = dtf.formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

const timeAgo = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
};

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

const DOW_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const; 
type DKey = typeof DOW_KEYS[number];

function ymdInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
function weekdayShortInTz(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d); 
}
function shortToKey(s: string): keyof NonNullable<WeekScheduleJSON> {
  return s.toLowerCase().slice(0,3) as any; 
}
function partsInTz(dateUTC: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(dateUTC);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}
function makeUtcForTz(target: {y:number; m:number; d:number; h:number; min:number}, tz: string): Date {
  let utc = Date.UTC(target.y, target.m - 1, target.d, target.h, target.min, 0);
  for (let i = 0; i < 3; i++) {
    const shown = partsInTz(new Date(utc), tz); 
    const desired = Date.UTC(target.y, target.m - 1, target.d, target.h, target.min, 0);
    const shownUTCFromLocal = Date.UTC(shown.y, shown.m - 1, shown.d, shown.h, shown.min, 0);
    const diff = desired - shownUTCFromLocal;
    if (Math.abs(diff) < 60 * 1000) break;
    utc += diff;
  }
  return new Date(utc);
}
function nextFromWeekSchedule(week: WeekScheduleJSON | null | undefined, tz: string): { iso: string } | null {
  if (!week) return null;

  const now = new Date();
  let best: Date | null = null;

  for (let addDays = 0; addDays < 14; addDays++) {
    const test = new Date(now.getTime() + addDays * 86400000);
    const dowShort = weekdayShortInTz(test, tz); 
    const key = shortToKey(dowShort);            
    const entries = (week as any)?.[key] as { time: string; duration?: number }[] | undefined;
    if (!entries?.length) continue;

    const { y, m, d } = ymdInTz(test, tz);

    for (const e of entries) {
      const [hh, mm] = (e.time || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
      const candidate = makeUtcForTz({ y, m, d, h: hh, min: mm }, tz);
      if (candidate.getTime() <= now.getTime()) continue;
      if (!best || candidate.getTime() < best.getTime()) best = candidate;
    }
    if (best) break; 
  }

  return best ? { iso: best.toISOString() } : null;
}

export async function fetchHome(): Promise<HomeData> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    return {
      user: { name: 'You', streak: 0 },
      todayStandup: null,
      coachHint: 'Sign in to see your coach hint.',
      podSnapshot: { name: 'Your Pod', tz: '—', tags: [], members: [] },
      shipLogPreview: [],
      recentActivities: [],
      counts: { podMembers: 0, standups: 0, openBlockers: 0 },
    };
  }

  const userId = user.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone, streak_current')
    .eq('id', userId)
    .maybeSingle();

  const metaName = (user.user_metadata as any)?.display_name as string | undefined;
  const emailName = user.email?.split('@')[0];
  const displayName =
    (profile?.display_name ?? '').trim() ||
    (metaName ?? '').trim() ||
    (emailName ?? '').trim() ||
    'You';

  const { data: primaryMember } = await supabase
    .from('pod_members')
    .select('pod_id, is_primary, pods(name, timezone, week_schedule)')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  const podId: string | undefined = primaryMember?.pod_id;
  const podName = (primaryMember as any)?.pods?.name ?? 'Your Pod';
  const podTz = (primaryMember as any)?.pods?.timezone ?? (profile?.timezone ?? 'UTC');
  const weekSchedule: WeekScheduleJSON = (primaryMember as any)?.pods?.week_schedule ?? null;

  const { data: members } = podId
    ? await supabase
        .from('pod_members')
        .select('profiles:profiles!inner(display_name, avatar_url)')
        .eq('pod_id', podId)
    : { data: [] as any[] };

  const memberAvatarUrls: string[] = (members ?? []).map((m, i) => {
    const name = m.profiles?.display_name ?? 'Dev';
    const fallback = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(name)}`;
    return m.profiles?.avatar_url || fallback || `https://i.pravatar.cc/100?img=${(i % 70) + 1}`;
  });

  const { data: nextStandup } = podId
    ? await supabase
        .from('standups')
        .select('id, pod_id, scheduled_at, duration_minutes, status')
        .eq('pod_id', podId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  let participants:
    | { name: string; avatarUrl?: string | null; status: 'invited' | 'going' | 'maybe' | 'declined' | 'checked_in' }[]
    | undefined;

  if (nextStandup?.id) {
    const { data: sp } = await supabase
      .from('standup_participants')
      .select('user_id, status, profiles:profiles!inner(display_name, avatar_url)')
      .eq('standup_id', nextStandup.id);

    participants = (sp ?? []).map((row: any) => ({
      name: row.profiles?.display_name ?? 'Dev',
      avatarUrl: row.profiles?.avatar_url ?? null,
      status: row.status,
    }));

    if ((participants?.length ?? 0) === 0) {
      participants = (members ?? []).map((m: any) => ({
        name: m.profiles?.display_name || 'Dev',
        avatarUrl: m.profiles?.avatar_url ?? null,
        status: 'invited' as const,
      }));
    }
  }

  const { data: lastDone } = podId
    ? await supabase
        .from('standups')
        .select('id, scheduled_at')
        .eq('pod_id', podId)
        .eq('status', 'done')
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: checkins } = lastDone?.id
    ? await supabase
        .from('standup_checkins')
        .select(
          'user_id, notes_yesterday, notes_today, blockers, tags, created_at, profiles:profiles!inner(display_name)'
        )
        .eq('standup_id', lastDone.id)
        .limit(8)
    : { data: [] as any[] };

  const { count: memberCount } = podId
    ? await supabase.from('pod_members').select('*', { count: 'exact', head: true }).eq('pod_id', podId)
    : { count: 0 };

  const { count: standupCount } = podId
    ? await supabase.from('standups').select('*', { count: 'exact', head: true }).eq('pod_id', podId)
    : { count: 0 };

  const { count: openBlockers } = podId
    ? await supabase
        .from('blockers')
        .select('*', { count: 'exact', head: true })
        .eq('pod_id', podId)
        .eq('status', 'open')
    : { count: 0 };

  const { data: activity } = podId
    ? await supabase
        .from('pod_recent_activity')
        .select('type, pod_id, occurred_at, title')
        .eq('pod_id', podId)
        .order('occurred_at', { ascending: false })
        .limit(6)
    : { data: [] as any[] };

  const { data: recentCheckins } = podId
    ? await supabase
        .from('standup_checkins')
        .select('tags, created_at, standups!inner(pod_id)')
        .eq('standups.pod_id', podId)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] as any[] };

  const { data: recentBlockers } = podId
    ? await supabase
        .from('blockers')
        .select('tags, created_at')
        .eq('pod_id', podId)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] as any[] };

  const dynamicTags =
    topTags(
      [
        ...(recentCheckins ?? []).map((r: any) => r.tags as string[] | null),
        ...(recentBlockers ?? []).map((b: any) => b.tags as string[] | null),
      ],
      3
    ) || ['#react-native', '#node', '#perf'];

  const shipLogPreview =
    (checkins ?? []).slice(0, 2).map((ci: any) => ({
      who: ci.profiles?.display_name ?? 'Dev',
      y: ci.notes_yesterday ?? [],
      t: ci.notes_today ?? [],
      b: ci.blockers ?? [],
      tags: (ci.tags ?? []).map((t: string) => t.replace(/^#*/, '')),
      ago: timeAgo(ci.created_at),
    })) ?? [];

  let scheduledAtISO = nextStandup?.scheduled_at ?? null;
  let joinable = !!nextStandup?.id;
  let isFromWeekSchedule = false;

  if (!scheduledAtISO && weekSchedule && podId) {
    const next = nextFromWeekSchedule(weekSchedule, podTz);
    if (next) {
      scheduledAtISO = next.iso;
      joinable = false; 
      isFromWeekSchedule = true;
      if (!participants) {
        participants = (members ?? []).map((m: any) => ({
          name: m.profiles?.display_name || 'Dev',
          avatarUrl: m.profiles?.avatar_url ?? null,
          status: 'invited' as const,
        }));
      }
    }
  }

  const timeLocal = scheduledAtISO
    ? new Date(scheduledAtISO).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
  const localTzAbbr = scheduledAtISO ? tzAbbr(scheduledAtISO, Intl.DateTimeFormat().resolvedOptions().timeZone) : '';
  const timePod = scheduledAtISO ? fmtInTz(scheduledAtISO, podTz) : '';
  const podTzAbbr = scheduledAtISO ? tzAbbr(scheduledAtISO, podTz) : '';

  return {
    user: { name: displayName, streak: profile?.streak_current ?? 0 },
    todayStandup: scheduledAtISO
      ? {
          standupId: nextStandup?.id ? String(nextStandup.id) : 'week-schedule',
          joinable,
          isFromWeekSchedule,
          podId: String(nextStandup?.pod_id ?? podId ?? ''),
          pod: podName,
          scheduledAtISO: scheduledAtISO!,
          timePod,
          podTz,
          podTzAbbr,
          timeLocal,
          localTzAbbr,
          participants,
        }
      : null,
    coachHint: 'No recent check-ins found.',
    podSnapshot: { name: podName, tz: podTz, tags: dynamicTags, members: memberAvatarUrls },
    shipLogPreview,
    recentActivities: (activity ?? []).map((a: any) => ({
      type: a.type,
      pod: podName,
      title: a.title ?? undefined,
      time: timeAgo(a.occurred_at),
    })),
    counts: { podMembers: memberCount ?? 0, standups: standupCount ?? 0, openBlockers: openBlockers ?? 0 },
  };
}
