import { supabase, FUNCTIONS_URL } from '@/lib/supabase';

async function jwt() {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Not signed in');
  return t;
}

export async function jiraLinkIssue(blockerId: string, input: string) {
  const token = await jwt();
  const res = await fetch(`${FUNCTIONS_URL}/jira/link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ blocker_id: blockerId, input }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || 'Link failed');
  return body.link as {
    issue_key: string; issue_url: string; status: string | null; summary: string | null;
  };
}

export async function jiraCreateIssue(blockerId: string, projectKey: string, summary: string, description?: string) {
  const token = await jwt();
  const res = await fetch(`${FUNCTIONS_URL}/jira/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ blocker_id: blockerId, projectKey, summary, description }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || 'Create failed');
  return body.link as {
    issue_key: string; issue_url: string; status: string | null; summary: string | null;
  };
}

export async function jiraFetchIssue(key: string) {
  const token = await jwt();
  const res = await fetch(`${FUNCTIONS_URL}/jira/issue?key=${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || 'Fetch failed');
  return body as { key: string; summary: string | null; status: string | null; projectKey: string | null };
}
