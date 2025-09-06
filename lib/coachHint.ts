import { supabase } from '@/lib/supabase';

const norm = (s: string) => (s || '').toLowerCase();
const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const summarizeList = (list?: string[] | null, max = 3) =>
  (list ?? []).filter(Boolean).slice(0, max).join(', ');

export async function generateCoachHintForUser(userId: string): Promise<string> {
  if (!userId) return '';

  const { data: last, error: lastErr } = await supabase
    .from('standup_checkins')
    .select('id, created_at, standup_id, notes_yesterday, notes_today, blockers, tags')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) console.error('coachHint.lastErr', lastErr);
  if (!last) return '';

  let podId: string | undefined;
  let nextStartISO: string | undefined;

  if (last.standup_id) {
    const { data: standup } = await supabase
      .from('standups')
      .select('id, pod_id, scheduled_at')
      .eq('id', last.standup_id)
      .maybeSingle();

    podId = standup?.pod_id;

    if (podId) {
      const { data: next } = await supabase
        .from('standups')
        .select('scheduled_at')
        .eq('pod_id', podId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      nextStartISO = next?.scheduled_at ?? undefined;
    }
  }

  const y = (last.notes_yesterday ?? []) as string[];
  const t = (last.notes_today ?? []) as string[];
  const b = (last.blockers ?? []) as string[];
  const tags = (last.tags ?? []) as string[];

  const yText = summarizeList(y);
  const tText = summarizeList(t);
  const bText = summarizeList(b);
  const tagText = summarizeList(tags?.map((x) => x.replace(/^#*/, '')));

  const lowerAll = [y.join(' '), t.join(' '), b.join(' ')].map(norm).join(' ');
  const hasTestyWords = /(test|qa|verify|smoke|e2e|coverage)/.test(lowerAll);
  const hasPR = /(pr|pull request|review)/.test(lowerAll);
  const hasDeploy = /(deploy|release|ship|publish|prod|production)/.test(lowerAll);
  const hasDesign = /(design|spec|plan|doc)/.test(lowerAll);
  const hasBlockers = b.length > 0;

  const framing = nextStartISO
    ? `Before your next standup (${new Date(nextStartISO).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })}), `
    : '';

  let tip: string;
  if (hasBlockers) {
    tip = `${framing}surface blockers early so teammates can jump in. Try converting “${bText}” into actionable asks (owner + ETA).`;
  } else if (hasDeploy) {
    tip = `${framing}wrap “${tText || yText}” with a minimal smoke test and a rollback note. It cuts recovery time if prod misbehaves.`;
  } else if (hasPR) {
    tip = `${framing}add crisp acceptance criteria to “${tText || yText}” and leave a short PR checklist (tests, screenshots, perf).`;
  } else if (hasDesign) {
    tip = `${framing}turn the plan for “${tText || yText}” into a shareable doc with risks & “done means…” bullets—review goes faster.`;
  } else if (hasTestyWords) {
    tip = `${framing}run a quick “happy path + one failure” check on “${tText || yText}”. Small tests prevent big detours.`;
  } else if (t.length) {
    tip = `${framing}make “${tText}” concrete: add an owner, a deadline, and success criteria. Future you will thank you.`;
  } else {
    tip = `${framing}write a tiny “today” bullet with a concrete outcome. Even 15 minutes of progress compounds.`;
  }

  const preface = [
    yText && `Yesterday: ${sentenceCase(yText)}.`,
    tText && `Today: ${sentenceCase(tText)}.`,
    tagText && `Tags: #${tagText.replace(/\s*,\s*/g, ' #')}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return [preface, `Suggestion: ${tip}`].filter(Boolean).join(' ');
}

export async function upsertCoachSuggestion(userId: string, suggestion: string) {
  if (!suggestion.trim()) return;
  const { error } = await supabase
    .from('coach_suggestions')
    .upsert([{ user_id: userId, suggestion }], { onConflict: 'user_id' });
  if (error) console.error('coachHint.upsert error', error);
}
