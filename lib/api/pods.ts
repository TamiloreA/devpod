import { supabase } from '@/lib/supabase';

export type PodMember = {
  name: string;
  level: string | null;
  avatarUrl: string | null;
  online: boolean;
};

export type PodData = {
  podId: string;
  name: string;
  description: string | null;
  timezone: string;
  tags: string[];
  members: PodMember[];
  nextStandupTime: string | null;
  streak: number;
};

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export async function createPod(args: { name: string; description?: string; timezone?: string }) {
  const { data, error } = await supabase.rpc('create_pod_with_membership', {
    p_name: args.name,
    p_description: args.description ?? null,
    p_timezone: args.timezone ?? 'Africa/Lagos',
  });
  if (error) throw error;
  return data as string;
}

export async function leavePod(podId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not signed in');

  const { error } = await supabase
    .from('pod_members')
    .delete()
    .eq('pod_id', podId)
    .eq('user_id', uid);
  if (error) throw error;
}

export async function fetchPodData(): Promise<PodData | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data: memPrimary } = await supabase
    .from('pod_members')
    .select('pod_id, is_primary, pods(name, description, timezone)')
    .eq('user_id', uid)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  let membership = memPrimary;
  if (!membership) {
    const { data: memAny } = await supabase
      .from('pod_members')
      .select('pod_id, is_primary, pods(name, description, timezone)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    membership = memAny ?? null;
  }

  if (!membership?.pod_id) return null;

  const podId = membership.pod_id as string;
  const podName = (membership as any)?.pods?.name ?? 'Your Pod';
  const podDesc = (membership as any)?.pods?.description ?? null;
  const tz = (membership as any)?.pods?.timezone ?? 'Africa/Lagos';

  const { data: members } = await supabase
    .from('pod_members')
    .select('profiles:profiles!inner(display_name, level, avatar_url)')
    .eq('pod_id', podId);

  const mappedMembers =
    (members ?? []).map((m: any) => ({
      name: m.profiles?.display_name ?? 'Dev',
      level: m.profiles?.level ?? null,
      avatarUrl: m.profiles?.avatar_url ?? null,
      online: false, 
    })) ?? [];

  const { data: next } = await supabase
    .from('standups')
    .select('scheduled_at')
    .eq('pod_id', podId)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: recentCheckins } = await supabase
    .from('standup_checkins')
    .select('tags, standups!inner(pod_id)')
    .eq('standups.pod_id', podId)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: recentBlockers } = await supabase
    .from('blockers')
    .select('tags')
    .eq('pod_id', podId)
    .order('created_at', { ascending: false })
    .limit(50);

  const tally = new Map<string, number>();
  const addTags = (arr?: any[]) =>
    (arr ?? []).forEach((row) =>
      (row.tags ?? []).forEach((raw: string) => {
        const t = String(raw).trim().replace(/^#*/, '').toLowerCase();
        if (!t) return;
        tally.set(t, (tally.get(t) ?? 0) + 1);
      }),
    );
  addTags(recentCheckins as any[]);
  addTags(recentBlockers as any[]);

  const tags = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => `#${t}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('streak_current')
    .eq('id', uid)
    .maybeSingle();

  return {
    podId,
    name: podName,
    description: podDesc,
    timezone: tz,
    tags,
    members: mappedMembers,
    nextStandupTime: next ? fmtTime(next.scheduled_at) : null,
    streak: profile?.streak_current ?? 0,
  };
}
