import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PodUIData = {
  podId: string;
  name: string;
  description?: string | null;
  timezone: string;
  streak: number; // pod streak (placeholder for now)
  nextStandupTime?: string | null;
  tags: string[];
  members: { id: string; name: string; initials: string; level?: string | null; online?: boolean }[];
};

type CreateInput = { name: string; description?: string; timezone?: string };

const fmtTime = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const initials = (full?: string | null) =>
  (full ?? '')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

export function usePodData() {
  const [data, setData] = useState<PodUIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setData(null);
        setLoading(false);
        return;
      }

      // 1) Find my primary pod (or any pod if no primary flag)
      const { data: pmRow, error: pmErr } = await supabase
        .from('pod_members')
        .select('pod_id')
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

      // 2) Load the pod (only existing columns)
      const { data: pod, error: podErr } = await supabase
        .from('pods')
        .select('id, name, description, timezone')
        .eq('id', podId)
        .maybeSingle();

      if (podErr || !pod) {
        if (podErr) console.error('pods select error', podErr);
        setData(null);
        setLoading(false);
        return;
      }

      // 3) Member user_ids
      const { data: memberIdsRows, error: idsErr } = await supabase
        .from('pod_members')
        .select('user_id')
        .eq('pod_id', podId);

      if (idsErr) {
        console.error('pod_members member ids error', idsErr);
      }

      const userIds = (memberIdsRows ?? [])
        .map(r => r.user_id as string)
        .filter(Boolean);

      // 4) Profiles for those user_ids (no FK join required)
      let profilesRows:
        | { id: string; display_name: string | null; level?: string | null }[]
        | null = [];
      let profErr: any = null;

      if (userIds.length) {
        const { data: pRows, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name, level') // only fields you actually have
          .in('id', userIds);

        profilesRows = pRows ?? [];
        profErr = pErr;
      }

      if (profErr) {
        console.error('profiles select error', profErr);
      }

      const members =
        (profilesRows ?? []).map(p => ({
          id: p.id,
          name: p.display_name || 'Member',
          initials: initials(p.display_name),
          level: (p as any).level ?? null,
          online: false, // if you later add an "online" field, map it here
        })) ?? [];

      // 5) Next standup
      const { data: next, error: nextErr } = await supabase
        .from('standups')
        .select('scheduled_at')
        .eq('pod_id', podId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextErr) {
        console.error('standups select error', nextErr);
      }

      const nextStandupTime = fmtTime(next?.scheduled_at ?? null);

      // 6) Tags (placeholder until you compute from data)
      const tags = ['#getting-started'];

      setData({
        podId,
        name: pod.name,
        description: pod.description,
        timezone: pod.timezone ?? 'Africa/Lagos',
        streak: 0, // no pods.streak_days column — set 0 or compute later
        nextStandupTime,
        tags,
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

  const create = useCallback(async ({ name, description, timezone }: CreateInput) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Not signed in');

    // 1) Create pod (RLS usually requires new.creator_id = auth.uid())
    const { data: pod, error } = await supabase
      .from('pods')
      .insert([{ name, description, timezone: timezone ?? 'Africa/Lagos', creator_id: uid }])
      .select('id, name, description, timezone')
      .single();

    if (error) {
      console.error('pods insert error', error);
      throw error;
    }

    // 2) Add membership (RLS: user can insert their own membership)
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
    setData(null);
  }, [data?.podId]);

  return { data, loading, error, create, leave, reload: load };
}
