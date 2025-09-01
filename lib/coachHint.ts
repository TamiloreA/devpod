import { supabase } from '@/lib/supabase';

type LastCheckinRow = {
  id: string;
  standup_id: string;
  notes_yesterday: string[] | null;
  notes_today: string[] | null;
  created_at: string;
  standups?: { pod_id: string } | null;
};

export async function getCoachHint(): Promise<string> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return '';

  const today = new Date().toISOString().slice(0, 10); 
  const { data: cached } = await supabase
    .from('coach_suggestions')
    .select('suggestion, created_at')
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00Z`)
    .lte('created_at', `${today}T23:59:59Z`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.suggestion) {
    return cached.suggestion;
  }

  const { data: last, error: lastErr } = await supabase
    .from('standup_checkins')
    .select(
      'id, standup_id, notes_yesterday, notes_today, created_at, standups:standups!inner(pod_id)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<LastCheckinRow>();

  if (lastErr) {
    console.warn('[coachHint] last check-in query:', lastErr.message);
  }
  if (!last) {
    return 'No recent check-ins found.';
  }

  let podId = last.standups?.pod_id as string | undefined;
  if (!podId && last.standup_id) {
    const { data: standup } = await supabase
      .from('standups')
      .select('pod_id')
      .eq('id', last.standup_id)
      .maybeSingle();
    podId = standup?.pod_id;
  }
  if (!podId) {
    return 'No upcoming standups found.';
  }

  await supabase
    .from('standups')
    .select('id, scheduled_at')
    .eq('pod_id', podId)
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const y = (last.notes_yesterday ?? []).join(', ');
  const hint = y
    ? `Yesterday you wrapped ${y}. Suggestion: ship a smoke test before integrating push.`
    : 'No notes from yesterday. Add one concrete win and 1–2 crisp tasks for today.';

  await supabase.from('coach_suggestions').upsert({
    user_id: userId,
    suggestion: hint,
    created_at: new Date().toISOString(), 
  });

  return hint;
}
