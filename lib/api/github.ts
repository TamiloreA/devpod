import { supabase } from '@/lib/supabase';

export type GithubLink = {
  id: string;
  pod_id: string;
  blocker_id: string | null;
  kind: 'issue' | 'pr' | 'commit';
  owner: string;
  repo: string;
  number: number | null;
  sha: string | null;
  title: string | null;
  url: string;
  state: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export async function addGithubLink(params: {
  podId: string;
  url: string;
  blockerId?: string | null;
  title?: string | null;
  metadata?: any;
}): Promise<GithubLink> {
  const { data, error } = await supabase.rpc('add_github_link', {
    p_pod_id: params.podId,
    p_url: params.url,
    p_blocker_id: params.blockerId ?? null,
    p_title: params.title ?? null,
    p_metadata: params.metadata ?? {},
  });
  if (error) throw error;
  return data as GithubLink;
}

export async function listGithubLinks(params: {
  podId: string;
  blockerId?: string | null;
  kind?: 'issue' | 'pr' | 'commit' | null;
  limit?: number;
  offset?: number;
}): Promise<GithubLink[]> {
  const { data, error } = await supabase.rpc('list_github_links', {
    p_pod_id: params.podId,
    p_blocker_id: params.blockerId ?? null,
    p_kind: params.kind ?? null,
    p_limit: params.limit ?? 200,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as GithubLink[];
}
