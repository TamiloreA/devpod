import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Dimensions,
  RefreshControl,
  Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  Plus,
  Clock,
  X,
  Send,
  Lightbulb,
  MessageSquare,
  UserPlus,
  GitBranch,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams } from 'expo-router';

// NEW: repo tree modal
import RepoTreeModal from '@/components/RepoTreeModal';

const { width, height } = Dimensions.get('window');

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

const parseTags = (input: string): string[] =>
  Array.from(
    new Set(
      (input || '')
        .split(/[, ]+/)
        .map((s) => s.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

const getStatusColor = (status: string) =>
  status === 'open'
    ? '#ff6b6b'
    : status === 'helping'
    ? '#ffaa00'
    : status === 'resolved'
    ? '#00ff88'
    : '#ffffff';

const getSeverityColor = (sev: 'low' | 'medium' | 'high') =>
  sev === 'high' ? '#ff6b6b' : sev === 'medium' ? '#ffaa00' : '#59d985';

/** ===== Types ===== */
type BlockerRow = {
  id: string;
  pod_id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  status: 'open' | 'helping' | 'resolved';
  created_at: string;
  user_id: string | null;
  helper_user_id: string | null;
};

type HelpReq = {
  id: string;
  pod_id: string;
  blocker_id: string;
  requester_user_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  created_at: string;
};

type HelpInvite = {
  id: string;
  pod_id: string;
  blocker_id: string;
  inviter_user_id: string;
  target_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_at: string;
};

type MemberProfile = {
  id: string;
  name: string;
  level: string | null;
  tags: string[];
};

type GithubLink = {
  id: string;
  pod_id: string;
  blocker_id: string | null;
  kind: 'issue' | 'pr' | 'commit' | 'repo' | 'tree' | 'blob';
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

const kindLabel = (k: GithubLink['kind']) =>
  k === 'issue'
    ? 'Issue'
    : k === 'pr'
    ? 'PR'
    : k === 'commit'
    ? 'Commit'
    : k === 'repo'
    ? 'Repo'
    : k === 'tree'
    ? 'Folder'
    : k === 'blob'
    ? 'File'
    : 'Link';

/** ===== Helper: parse any GitHub URL → {owner, repo, ref?, filePath?} ===== */
const parseRepoOrFileUrl = (
  raw: string
):
  | { owner: string; repo: string; ref?: string; filePath?: string }
  | null => {
  try {
    const cleaned = raw.replace(/\s+/g, ''); // strip all whitespace/newlines
    const u = new URL(cleaned);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;
    const [owner, repo, third, fourth, ...rest] = parts;

    // File: /owner/repo/blob/ref/path/to/file
    if (third === 'blob' && fourth) {
      return {
        owner,
        repo,
        ref: fourth,
        filePath: rest.length ? rest.join('/') : undefined,
      };
    }

    // Folder (tree): /owner/repo/tree/ref[/path]
    if (third === 'tree' && fourth) {
      return {
        owner,
        repo,
        ref: fourth,
        filePath: rest.length ? rest.join('/') : undefined,
      };
    }

    // Anything else (issue/pr/commit/root): open tree for the repo
    return { owner, repo };
  } catch {
    return null;
  }
};

export default function BlockersScreen() {
  const params = useLocalSearchParams<{ raise?: string }>();

  const [authUid, setAuthUid] = useState<string | null>(null);
  const [podId, setPodId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);

  // Suggestions + invites
  const [members, setMembers] = useState<MemberProfile[]>([]);
  // blockerId -> { targetUserId -> status }
  const [invitesByBlocker, setInvitesByBlocker] = useState<
    Record<string, Record<string, HelpInvite['status']>>
  >({});

  // GitHub links (grouped by blocker_id)
  const [linksByBlocker, setLinksByBlocker] = useState<
    Record<string, GithubLink[]>
  >({});

  // View filters
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'open' | 'helping' | 'resolved'
  >('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'forYou' | 'mine'>(
    'all'
  );
  const [q, setQ] = useState('');

  // Composer + triage
  const [composeText, setComposeText] = useState('');
  const [triage, setTriage] = useState<{
    severity: 'low' | 'medium' | 'high';
    tags: string[];
    note: string;
  } | null>(null);

  // Create flow
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blockerText, setBlockerText] = useState('');
  const [creating, setCreating] = useState(false);

  // Owner "ask for help" modal
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [askBlocker, setAskBlocker] = useState<BlockerRow | null>(null);
  const [helpSearch, setHelpSearch] = useState('');

  // GitHub attach modal
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachFor, setAttachFor] = useState<BlockerRow | null>(null);
  const [attachUrl, setAttachUrl] = useState('');
  const [attachTitle, setAttachTitle] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);

  // NEW: Repo tree modal state
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeCtx, setTreeCtx] = useState<{
    owner: string;
    repo: string;
    ref?: string;
    filePath?: string;
  } | null>(null);

  // Realtime channels
  const rtBlockersRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const rtHelpRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rtInviteRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // My volunteer requests (when I ask to help others)
  const [myHelp, setMyHelp] = useState<Record<string, HelpReq['status']>>({});

  // Button animation
  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  // ---- Initial: auth → primary pod → data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        setAuthUid(uid);
        if (!uid) {
          setLoading(false);
          return;
        }

        const { data: pm, error: pmErr } = await supabase
          .from('pod_members')
          .select('pod_id')
          .eq('user_id', uid)
          .order('is_primary', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pmErr) throw pmErr;

        const p = pm?.pod_id ?? null;
        setPodId(p);

        if (p) {
          await Promise.all([
            loadBlockers(p),
            loadMyHelpRequests(p, uid),
            loadMembers(p, uid),
            loadGithubLinks(p),
          ]);
          await preloadInvitesForBlockers(p, uid);
        } else {
          setBlockers([]);
          setMyHelp({});
          setMembers([]);
          setInvitesByBlocker({});
          setLinksByBlocker({});
        }
      } catch (e: any) {
        console.error('blockers.init', e);
        Alert.alert('Error', e?.message ?? 'Could not load blockers.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (params.raise === '1') setShowCreateModal(true);
  }, [params.raise]);

  // ---- Realtime: blockers
  useEffect(() => {
    if (!podId) return;
    if (rtBlockersRef.current) {
      rtBlockersRef.current.unsubscribe();
      rtBlockersRef.current = null;
    }

    const ch = supabase
      .channel(`rt-blockers:${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blockers',
          filter: `pod_id=eq.${podId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as BlockerRow;
            setBlockers((prev) =>
              (prev.some((b) => b.id === row.id) ? prev : [row, ...prev]).sort(
                (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
              )
            );
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as BlockerRow;
            setBlockers((prev) => prev.map((b) => (b.id === row.id ? row : b)));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as BlockerRow;
            setBlockers((prev) => prev.filter((b) => b.id !== row.id));
          }
        }
      )
      .subscribe();
    rtBlockersRef.current = ch;
    return () => {
      ch.unsubscribe();
      rtBlockersRef.current = null;
    };
  }, [podId]);

  // ---- Realtime: volunteer requests (I ask to help others)
  useEffect(() => {
    if (!podId || !authUid) return;
    if (rtHelpRef.current) {
      rtHelpRef.current.unsubscribe();
      rtHelpRef.current = null;
    }

    const ch = supabase
      .channel(`rt-bhr:${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blocker_help_requests',
          filter: `pod_id=eq.${podId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as HelpReq;
          if (!row || row.requester_user_id !== authUid) return; // only track my requests
          setMyHelp((prev) => {
            const next = { ...prev };
            if (payload.eventType === 'DELETE') {
              delete next[row.blocker_id];
            } else {
              next[row.blocker_id] =
                (payload.new as HelpReq)?.status ?? prev[row.blocker_id];
            }
            return next;
          });
        }
      )
      .subscribe();
    rtHelpRef.current = ch;
    return () => {
      ch.unsubscribe();
      rtHelpRef.current = null;
    };
  }, [podId, authUid]);

  // ---- Realtime: invites (owner asks target; I care if I am target OR inviter)
  useEffect(() => {
    if (!podId || !authUid) return;
    if (rtInviteRef.current) {
      rtInviteRef.current.unsubscribe();
      rtInviteRef.current = null;
    }

    const ch = supabase
      .channel(`rt-bhi:${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blocker_help_invites',
          filter: `pod_id=eq.${podId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as HelpInvite;
          if (!row) return;
          if (
            row.inviter_user_id === authUid ||
            row.target_user_id === authUid
          ) {
            setInvitesByBlocker((prev) => {
              const copy = { ...prev };
              const m = { ...(copy[row.blocker_id] ?? {}) };
              if (payload.eventType === 'DELETE') {
                delete m[row.target_user_id];
              } else {
                m[row.target_user_id] =
                  (payload.new as HelpInvite)?.status ?? m[row.target_user_id];
              }
              copy[row.blocker_id] = m;
              return copy;
            });
          }
        }
      )
      .subscribe();
    rtInviteRef.current = ch;
    return () => {
      ch.unsubscribe();
      rtInviteRef.current = null;
    };
  }, [podId, authUid]);

  // ---- Loaders
  const loadBlockers = useCallback(async (p: string) => {
    const { data, error } = await supabase
      .from('blockers')
      .select(
        'id, pod_id, title, description, tags, status, created_at, user_id, helper_user_id'
      )
      .eq('pod_id', p)
      .order('created_at', { ascending: false });
    if (error) throw error;
    setBlockers((data ?? []) as BlockerRow[]);
  }, []);

  const loadMyHelpRequests = useCallback(async (p: string, uid: string) => {
    const { data, error } = await supabase
      .from('blocker_help_requests')
      .select('blocker_id, status')
      .eq('pod_id', p)
      .eq('requester_user_id', uid);
    if (error) throw error;
    const m: Record<string, HelpReq['status']> = {};
    (data ?? []).forEach((r: any) => {
      m[r.blocker_id] = r.status;
    });
    setMyHelp(m);
  }, []);

  const loadMembers = useCallback(async (p: string, _uid: string) => {
    const { data: ids, error: idsErr } = await supabase
      .from('pod_members')
      .select('user_id')
      .eq('pod_id', p);
    if (idsErr) {
      console.error('members ids error', idsErr);
      return;
    }
    const userIds = (ids ?? []).map((r: any) => r.user_id).filter(Boolean);
    if (!userIds.length) {
      setMembers([]);
      return;
    }

    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, level, skills')
      .in('id', userIds);
    if (pErr) {
      console.error('profiles error', pErr);
      setMembers([]);
      return;
    }

    const mapped: MemberProfile[] = (profs ?? []).map((p: any) => ({
      id: p.id,
      name: p.display_name ?? 'Member',
      level: p.level ?? null,
      tags: Array.isArray(p?.skills)
        ? p.skills
            .map((x: any) => String(x).trim().toLowerCase())
            .filter(Boolean)
        : [],
    }));

    setMembers(mapped);
  }, []);

  const preloadInvitesForBlockers = useCallback(
    async (p: string, uid: string) => {
      const { data, error } = await supabase
        .from('blocker_help_invites')
        .select('blocker_id, target_user_id, inviter_user_id, status')
        .eq('pod_id', p)
        .or(`inviter_user_id.eq.${uid},target_user_id.eq.${uid}`);
      if (error) {
        console.error('preload invites error', error);
        return;
      }

      const byB: Record<string, Record<string, HelpInvite['status']>> = {};
      (data ?? []).forEach((row: any) => {
        if (!byB[row.blocker_id]) byB[row.blocker_id] = {};
        byB[row.blocker_id][row.target_user_id] = row.status;
      });
      setInvitesByBlocker(byB);
    },
    []
  );

  const loadGithubLinks = useCallback(async (p: string) => {
    try {
      const { data, error } = await supabase.rpc('list_github_links', {
        p_pod_id: p,
        p_blocker_id: null,
        p_kind: null,
        p_limit: 500,
        p_offset: 0,
      });
      if (error) throw error;
      const grouped: Record<string, GithubLink[]> = {};
      (data ?? []).forEach((gl: any) => {
        const key = gl.blocker_id ?? '__pod__';
        (grouped[key] ||= []).push(gl as GithubLink);
      });
      setLinksByBlocker(grouped);
    } catch (e: any) {
      console.log('github.list error', e?.message);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    if (!podId || !authUid) return;
    try {
      setRefreshing(true);
      await Promise.all([
        loadBlockers(podId),
        loadMyHelpRequests(podId, authUid),
        loadMembers(podId, authUid),
        preloadInvitesForBlockers(podId, authUid),
        loadGithubLinks(podId),
      ]);
    } catch (e: any) {
      console.error('blockers.refresh', e);
    } finally {
      setRefreshing(false);
    }
  }, [
    podId,
    authUid,
    loadBlockers,
    loadMyHelpRequests,
    loadMembers,
    preloadInvitesForBlockers,
    loadGithubLinks,
  ]);

  // ---- Simple triage
  const runTriage = (text: string) => {
    const lower = text.toLowerCase();
    const severity: 'low' | 'medium' | 'high' =
      lower.includes('crash') ||
      lower.includes('freeze') ||
      lower.includes('fatal')
        ? 'high'
        : lower.includes('perf') ||
          lower.includes('slow') ||
          lower.includes('lag')
        ? 'medium'
        : 'low';
    const inferred = [
      lower.includes('redux') && 'redux',
      lower.includes('rtk') && 'rtk-query',
      lower.includes('navigation') && 'navigation',
      lower.includes('expo') && 'expo',
      lower.includes('ios') && 'ios',
      lower.includes('android') && 'android',
      lower.includes('build') && 'build',
      lower.includes('network') && 'network',
    ].filter(Boolean) as string[];
    setTriage({
      severity,
      tags: (inferred.length ? inferred : ['general']).slice(0, 4),
      note:
        severity === 'high'
          ? 'Looks urgent. Add exact error text, repro steps, device/OS, and recent changes.'
          : severity === 'medium'
          ? 'Likely performance/state related. Try profiling, memoization, or cache invalidation.'
          : 'Start with a minimal repro and expected vs actual behavior.',
    });
  };

  const openModalPrefilled = () => {
    setBlockerText(composeText);
    setShowCreateModal(true);
  };

  // ---- Create blocker
  const handleCreateBlocker = async () => {
    if (!blockerText.trim())
      return Alert.alert('Missing details', 'Describe your blocker briefly.');
    if (!podId || !authUid)
      return Alert.alert('No pod', 'Join or create a pod first.');

    buttonScale.value = withSpring(0.95, { duration: 100 }, () => {
      buttonScale.value = withSpring(1);
    });

    try {
      setCreating(true);
      const title = blockerText.split('\n')[0].slice(0, 120) || 'New blocker';
      const description = blockerText.trim();
      const tags = Array.from(
        new Set([...(triage?.tags ?? []), ...parseTags(description)])
      ).slice(0, 8);

      const { data, error } = await supabase
        .from('blockers')
        .insert([
          {
            pod_id: podId,
            title,
            description,
            tags,
            status: 'open',
            user_id: authUid,
          },
        ])
        .select(
          'id, pod_id, title, description, tags, status, created_at, user_id, helper_user_id'
        )
        .single();
      if (error) throw error;

      setBlockers((prev) => [data as BlockerRow, ...prev]);
      setShowCreateModal(false);
      setBlockerText('');
      setComposeText('');
      setTriage(null);
    } catch (e: any) {
      console.error('create blocker', e);
      Alert.alert('Could not create blocker', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  // ---- Volunteer flow (helping others)
  const askToHelp = async (blocker: BlockerRow) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blocker_help_requests')
        .insert([
          {
            pod_id: podId,
            blocker_id: blocker.id,
            requester_user_id: authUid,
            status: 'pending',
          },
        ]);
      if (error && (error as any).code !== '23505') throw error; // ignore duplicate
      setMyHelp((m) => ({ ...m, [blocker.id]: 'pending' }));
    } catch (e: any) {
      console.error('askToHelp', e);
      Alert.alert('Could not request', e?.message ?? 'Please try again.');
    }
  };

  const withdrawHelp = async (blocker: BlockerRow) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blocker_help_requests')
        .update({ status: 'withdrawn' })
        .eq('pod_id', podId)
        .eq('blocker_id', blocker.id)
        .eq('requester_user_id', authUid)
        .in('status', ['pending']);
      if (error) throw error;
      setMyHelp((m) => ({ ...m, [blocker.id]: 'withdrawn' }));
    } catch (e: any) {
      console.error('withdrawHelp', e);
      Alert.alert('Could not withdraw', e?.message ?? 'Please try again.');
    }
  };

  const assignMe = async (blocker: BlockerRow) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blockers')
        .update({ helper_user_id: authUid, status: 'helping' })
        .eq('id', blocker.id)
        .eq('pod_id', podId);
      if (error) throw error;

      await supabase
        .from('blocker_help_requests')
        .update({ status: 'accepted' })
        .eq('pod_id', podId)
        .eq('blocker_id', blocker.id)
        .eq('requester_user_id', authUid)
        .in('status', ['pending']);

      setMyHelp((m) => ({ ...m, [blocker.id]: 'accepted' }));
      setBlockers((prev) =>
        prev.map((b) =>
          b.id === blocker.id
            ? { ...b, helper_user_id: authUid, status: 'helping' }
            : b
        )
      );
    } catch (e: any) {
      console.error('assignMe', e);
      Alert.alert('Could not assign', e?.message ?? 'Please try again.');
    }
  };

  // ---- Owner Ask-for-help (invites)
  const openAskForHelp = async (blocker: BlockerRow) => {
    setAskBlocker(blocker);
    setHelpSearch('');
    setAskModalOpen(true);
    try {
      const { data, error } = await supabase
        .from('blocker_help_invites')
        .select('target_user_id, status')
        .eq('pod_id', blocker.pod_id)
        .eq('blocker_id', blocker.id);
      if (!error) {
        const m: Record<string, HelpInvite['status']> = {};
        (data ?? []).forEach((r: any) => {
          m[r.target_user_id] = r.status;
        });
        setInvitesByBlocker((prev) => ({ ...prev, [blocker.id]: m }));
      }
    } catch {
      // non-fatal
    }
  };

  const inviteHelper = async (blocker: BlockerRow, userId: string) => {
    if (!podId || !authUid) return;
    try {
      const { error } = await supabase
        .from('blocker_help_invites')
        .insert([
          {
            pod_id: podId,
            blocker_id: blocker.id,
            inviter_user_id: authUid,
            target_user_id: userId,
            status: 'pending',
          },
        ]);
      if (error && (error as any).code !== '23505') throw error; // ignore duplicate
      setInvitesByBlocker((prev) => {
        const copy = { ...prev };
        const m = { ...(copy[blocker.id] ?? {}) };
        m[userId] = 'pending';
        copy[blocker.id] = m;
        return copy;
      });
    } catch (e: any) {
      console.error('inviteHelper', e);
      Alert.alert('Could not send invite', e?.message ?? 'Please try again.');
    }
  };

  const resolveBlocker = async (id: string) => {
    if (!podId) return;
    try {
      const { error } = await supabase
        .from('blockers')
        .update({ status: 'resolved' })
        .eq('id', id)
        .eq('pod_id', podId);

      if (error) throw error;

      // Optimistic UI
      setBlockers((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'resolved' } : b))
      );
    } catch (e: any) {
      console.error('resolveBlocker', e);
      Alert.alert('Update failed', e?.message ?? 'Could not update blocker.');
    }
  };

  // ---- Invited-user actions
  const acceptInvite = async (blocker: BlockerRow) => {
    if (!authUid) return;
    try {
      const { error } = await supabase.rpc('accept_blocker_invite', {
        p_blocker: blocker.id,
        p_target: authUid,
      });
      if (error) throw error;

      // optimistic UI
      setBlockers((prev) =>
        prev.map((x) =>
          x.id === blocker.id
            ? { ...x, helper_user_id: authUid, status: 'helping' }
            : x
        )
      );
      setInvitesByBlocker((prev) => {
        const copy = { ...prev };
        const m = { ...(copy[blocker.id] ?? {}) };
        m[authUid] = 'accepted';
        copy[blocker.id] = m;
        return copy;
      });
    } catch (e: any) {
      Alert.alert('Could not accept', e?.message ?? 'Please try again.');
    }
  };

  const declineInvite = async (blocker: BlockerRow) => {
    if (!authUid) return;
    try {
      const { error } = await supabase.rpc('decline_blocker_invite', {
        p_blocker: blocker.id,
        p_target: authUid,
      });
      if (error) throw error;

      setInvitesByBlocker((prev) => {
        const copy = { ...prev };
        const m = { ...(copy[blocker.id] ?? {}) };
        m[authUid] = 'declined';
        copy[blocker.id] = m;
        return copy;
      });
    } catch (e: any) {
      Alert.alert('Could not decline', e?.message ?? 'Please try again.');
    }
  };

  // ---- Suggestions for owner (tag overlap)
  const suggestions = useMemo(() => {
    if (!askBlocker)
      return [] as { member: MemberProfile; score: number; overlap: number }[];
    const me = authUid;
    const wants = new Set(
      (askBlocker.tags ?? []).map((t) => String(t).toLowerCase())
    );
    const scored = members
      .filter((m) => m.id !== me)
      .map((m) => {
        const overlap = m.tags.filter((t) => wants.has(t)).length;
        const denom = Math.max(1, wants.size);
        const score = overlap / denom;
        return { member: m, score, overlap };
      })
      .filter((x) => x.overlap > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.member.name || '').localeCompare(b.member.name || '')
      );
    return scored;
  }, [askBlocker, members, authUid]);

  // ---- Header badge: pending invites for me
  const pendingForMeCount = useMemo(() => {
    if (!authUid) return 0;
    let n = 0;
    for (const [, byUser] of Object.entries(invitesByBlocker)) {
      if (byUser[authUid] === 'pending') n++;
    }
    return n;
  }, [invitesByBlocker, authUid]);

  // ---- Filters + stats
  const filtered = useMemo(
    () =>
      blockers.filter((b) => {
        const owner = authUid && b.user_id === authUid;
        const invitedMePending =
          !!authUid && invitesByBlocker[b.id]?.[authUid] === 'pending';

        if (viewFilter === 'forYou' && !invitedMePending) return false;
        if (viewFilter === 'mine' && !owner) return false;

        if (statusFilter !== 'all' && b.status !== statusFilter) return false;
        if (!q.trim()) return true;
        const blob = (
          b.title +
          ' ' +
          (b.description ?? '') +
          ' ' +
          (b.tags ?? []).join(' ')
        ).toLowerCase();
        return blob.includes(q.toLowerCase());
      }),
    [blockers, statusFilter, q, viewFilter, invitesByBlocker, authUid]
  );

  const stats = useMemo(
    () => ({
      open: blockers.filter((b) => b.status === 'open').length,
      helping: blockers.filter((b) => b.status === 'helping').length,
      resolved: blockers.filter((b) => b.status === 'resolved').length,
    }),
    [blockers]
  );

  // Search list inside Ask-for-help modal
  const searchResults = useMemo(() => {
    if (!askBlocker) return [];
    const me = authUid;
    const q = helpSearch.trim().toLowerCase();
    const list = members.filter((m) => m.id !== me);
    if (!q) return suggestions.length ? [] : list;
    return list.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(q) ||
        m.tags.some((t) => t.includes(q))
    );
  }, [members, authUid, helpSearch, suggestions.length, askBlocker]);

  // NEW: open repo tree from any GitHub URL
  const openRepoTreeFromUrl = (url: string) => {
    const info = parseRepoOrFileUrl(url);
    if (!info) return Alert.alert('GitHub', 'Unsupported GitHub URL');
    setTreeCtx(info);
    setTreeOpen(true);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0a0a0a', '#000000']}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
        >
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={styles.header}
          >
            <Text style={styles.title}>Blockers</Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              {pendingForMeCount > 0 && (
                <View style={styles.requestPill}>
                  <Text style={styles.requestPillText}>
                    Requests • {pendingForMeCount}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowCreateModal(true)}
                disabled={!podId}
              >
                <Plus color="#000000" size={20} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Status chips (existing) */}
          <View style={styles.statsStrip}>
            <View style={[styles.statChip, { backgroundColor: '#2a1313' }]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: getStatusColor('open') },
                ]}
              />
              <Text style={styles.statChipText}>Open {stats.open}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#211a0c' }]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: getStatusColor('helping') },
                ]}
              />
              <Text style={styles.statChipText}>Helping {stats.helping}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#0f2118' }]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: getStatusColor('resolved') },
                ]}
              />
              <Text style={styles.statChipText}>Resolved {stats.resolved}</Text>
            </View>
          </View>

          {/* New view chips */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {(['all', 'forYou', 'mine'] as const).map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => setViewFilter(v)}
                style={[styles.seg, viewFilter === v && styles.segActive]}
              >
                <Text
                  style={[
                    styles.segText,
                    viewFilter === v && styles.segTextActive,
                  ]}
                >
                  {v === 'all' ? 'All' : v === 'forYou' ? 'For you' : 'Mine'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Composer */}
          <BlurView intensity={20} style={styles.composerGlass}>
            <View style={styles.composerRow}>
              <TextInput
                value={composeText}
                onChangeText={(t) => {
                  setComposeText(t);
                  if (t.length > 2) runTriage(t);
                  else setTriage(null);
                }}
                placeholder={
                  podId
                    ? "What's blocking you? (one line)"
                    : 'Join a pod to raise blockers'
                }
                placeholderTextColor="#888"
                style={styles.composerInput}
                returnKeyType="send"
                onSubmitEditing={() => (podId ? openModalPrefilled() : null)}
                editable={!!podId}
              />
              <TouchableOpacity
                style={styles.raiseBtn}
                onPress={openModalPrefilled}
                disabled={!podId}
              >
                <Text style={styles.raiseBtnText}>Raise</Text>
              </TouchableOpacity>
            </View>
            {triage && (
              <View style={styles.triageRow}>
                <View
                  style={[
                    styles.sevPill,
                    { borderColor: getSeverityColor(triage.severity) },
                  ]}
                >
                  <Text
                    style={[
                      styles.sevPillText,
                      { color: getSeverityColor(triage.severity) },
                    ]}
                  >
                    {triage.severity.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.triageTags}>
                  {triage.tags.slice(0, 3).map((t) => (
                    <View key={t} style={styles.triageTag}>
                      <Text style={styles.triageTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.triageNote} numberOfLines={2}>
                  {triage.note}
                </Text>
              </View>
            )}
          </BlurView>

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <Text style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>
              {podId
                ? viewFilter === 'forYou'
                  ? 'No invites yet.'
                  : 'No blockers yet.'
                : 'Join or create a pod to see blockers.'}
            </Text>
          )}

          {/* List */}
          {filtered.map((b, i) => {
            const owner = authUid && b.user_id === authUid;
            const myReq = myHelp[b.id]; // volunteer status for me
            const iAmHelper = authUid && b.helper_user_id === authUid;
            const canVolunteer =
              !owner &&
              b.status !== 'resolved' &&
              !iAmHelper &&
              myReq !== 'pending' &&
              myReq !== 'accepted';
            const myInviteStatus = authUid
              ? (invitesByBlocker[b.id]?.[authUid] as
                  | HelpInvite['status']
                  | undefined)
              : undefined;

            const ghLinks = linksByBlocker[b.id] ?? [];

            return (
              <Animated.View
                key={b.id}
                entering={FadeInDown.delay(300 + i * 100).springify()}
                style={styles.cardContainer}
              >
                <BlurView intensity={20} style={styles.cardGlass}>
                  <View style={styles.blockerCard}>
                    <View style={styles.blockerHeader}>
                      <View style={styles.statusRow}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: getStatusColor(b.status) },
                          ]}
                        />
                        <Text style={styles.statusText}>
                          {b.status === 'open' && 'Open'}
                          {b.status === 'helping' && 'Being helped'}
                          {b.status === 'resolved' && 'Resolved'}
                          {iAmHelper && ' • You'}
                        </Text>
                      </View>
                      <View style={styles.timeRow}>
                        <Clock color="#666666" size={14} />
                        <Text style={styles.timestamp}>
                          {timeAgo(b.created_at)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.blockerTitle}>{b.title}</Text>
                    {!!b.description && (
                      <Text style={styles.blockerDescription}>
                        {b.description}
                      </Text>
                    )}

                    {b.status === 'open' && (
                      <View style={styles.aiHint}>
                        <Lightbulb size={14} color="#ffd966" />
                        <Text style={styles.aiHintText}>
                          Tip: Add a minimal repro and expected/actual behavior
                          to speed up help.
                        </Text>
                      </View>
                    )}

                    <View style={styles.tagsContainer}>
                      {(b.tags ?? []).map((tag, idx) => (
                        <View key={`${b.id}-${tag}-${idx}`} style={styles.tag}>
                          <Text style={styles.tagText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>

                    {/* GitHub links under this blocker */}
                    {ghLinks.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        {ghLinks.map((gl) => (
                          <View
                            key={gl.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 6,
                              justifyContent: 'space-between',
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => Linking.openURL(gl.url)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 as any, flex: 1 }}
                            >
                              <View
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: '#9aa0a6',
                                }}
                              />
                              <Text
                                style={{ color: '#cfcfcf', fontSize: 12 }}
                                numberOfLines={1}
                              >
                                {kindLabel(gl.kind)} • {gl.title ?? `${gl.owner}/${gl.repo}`}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => openRepoTreeFromUrl(gl.url)}
                              style={[
                                styles.invBtnSecondary,
                                { paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 },
                              ]}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 as any }}>
                                <GitBranch size={14} color="#fff" />
                                <Text style={styles.invBtnSecondaryText}>Tree</Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Inline invite banner for target */}
                    {!!myInviteStatus && myInviteStatus === 'pending' && (
                      <View style={styles.inviteBanner}>
                        <Text style={styles.inviteBannerText}>
                          You were invited to help.
                        </Text>
                        <TouchableOpacity
                          onPress={() => acceptInvite(b)}
                          style={[
                            styles.invBtnPrimary,
                            { paddingHorizontal: 12 },
                          ]}
                        >
                          <Text style={styles.invBtnPrimaryText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => declineInvite(b)}
                          style={[
                            styles.invBtnSecondary,
                            { paddingHorizontal: 12 },
                          ]}
                        >
                          <Text style={styles.invBtnSecondaryText}>
                            Decline
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={styles.cardFooter}>
                      {/* Primary action */}
                      {owner ? (
                        <TouchableOpacity
                          style={styles.footerBtnPrimary}
                          onPress={() => openAskForHelp(b)}
                        >
                          <UserPlus size={16} color="#000" />
                          <Text style={styles.footerBtnPrimaryText}>
                            Ask for help
                          </Text>
                        </TouchableOpacity>
                      ) : iAmHelper ? (
                        <View style={styles.footerBtnPrimary}>
                          <MessageSquare size={16} color="#000" />
                          <Text style={styles.footerBtnPrimaryText}>
                            You’re helping
                          </Text>
                        </View>
                      ) : canVolunteer ? (
                        <TouchableOpacity
                          style={styles.footerBtnPrimary}
                          onPress={() => askToHelp(b)}
                        >
                          <MessageSquare size={16} color="#000" />
                          <Text style={styles.footerBtnPrimaryText}>
                            Ask to help
                          </Text>
                        </TouchableOpacity>
                      ) : myReq === 'pending' ? (
                        <TouchableOpacity
                          style={styles.footerBtnPrimary}
                          onPress={() => withdrawHelp(b)}
                        >
                          <MessageSquare size={16} color="#000" />
                          <Text style={styles.footerBtnPrimaryText}>
                            Requested (tap to withdraw)
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View
                          style={[styles.footerBtnPrimary, { opacity: 0.65 }]}
                        >
                          <MessageSquare size={16} color="#000" />
                          <Text style={styles.footerBtnPrimaryText}>
                            Ask to help
                          </Text>
                        </View>
                      )}

                      {/* Owner: Attach GitHub */}
                      {owner && (
                        <TouchableOpacity
                          style={styles.footerBtnSecondary}
                          onPress={() => {
                            setAttachFor(b);
                            setAttachUrl('');
                            setAttachTitle('');
                            setAttachOpen(true);
                          }}
                        >
                          <Text style={styles.footerBtnSecondaryText}>
                            Attach GitHub
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Quick "View Repo Tree" using first link if present */}
                      {ghLinks.length > 0 && (
                        <TouchableOpacity
                          style={styles.footerBtnSecondary}
                          onPress={() => openRepoTreeFromUrl(ghLinks[0].url)}
                        >
                          <Text style={styles.footerBtnSecondaryText}>
                            View Repo Tree
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Self-assign (only for non-owners) */}
                      {!owner &&
                        b.status !== 'helping' &&
                        b.status !== 'resolved' && (
                          <TouchableOpacity
                            style={styles.footerBtnSecondary}
                            onPress={() => assignMe(b)}
                          >
                            <Text style={styles.footerBtnSecondaryText}>
                              Assign me
                            </Text>
                          </TouchableOpacity>
                        )}

                      {/* Resolve */}
                      {b.status !== 'resolved' && (
                        <TouchableOpacity
                          style={styles.footerBtnDanger}
                          onPress={() => resolveBlocker(b.id)}
                        >
                          <Text style={styles.footerBtnDangerText}>
                            Resolve
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </BlurView>
              </Animated.View>
            );
          })}
        </ScrollView>

        {/* Create modal */}
        <Modal
          visible={showCreateModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowCreateModal(false)}
        >
          <BlurView intensity={40} style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInUp.springify()}
              style={styles.modalContainer}
            >
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Lightbulb color="#ffffff" size={20} />
                      <Text style={styles.modalTitle}>
                        Describe Your Blocker
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => setShowCreateModal(false)}
                    >
                      <X color="#ffffff" size={20} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.blockerInput}
                    placeholder="What's blocking you? Be specific about the tech stack, error messages, or concept…"
                    placeholderTextColor="#666666"
                    value={blockerText}
                    onChangeText={(t) => {
                      setBlockerText(t);
                      if (t.length > 2) runTriage(t);
                      else setTriage(null);
                    }}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    editable={!creating}
                  />

                  {triage && (
                    <View
                      style={[
                        styles.aiHint,
                        { marginTop: 0, marginBottom: 16 },
                      ]}
                    >
                      <Lightbulb size={14} color="#ffd966" />
                      <Text style={styles.aiHintText}>{triage.note}</Text>
                    </View>
                  )}

                  <Animated.View style={buttonAnimatedStyle}>
                    <TouchableOpacity
                      style={[
                        styles.createButton,
                        creating && { opacity: 0.85 },
                      ]}
                      onPress={handleCreateBlocker}
                      activeOpacity={0.8}
                      disabled={creating}
                    >
                      <Send color="#000000" size={18} />
                      <Text style={styles.createButtonText}>
                        {creating ? 'Creating…' : 'Find Helpers'}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </BlurView>
            </Animated.View>
          </BlurView>
        </Modal>

        {/* Ask-for-help modal (owner) */}
        <Modal
          visible={askModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAskModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContainer,
                { width: width - 40, maxHeight: height * 0.78 },
              ]}
            >
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <UserPlus color="#ffffff" size={20} />
                      <Text style={styles.modalTitle}>Ask for help</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => setAskModalOpen(false)}
                    >
                      <X color="#ffffff" size={20} />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color: '#bbb', marginBottom: 8 }}>
                    {(askBlocker?.tags ?? []).length
                      ? `Suggesting based on: #${(askBlocker?.tags ?? []).join(
                          ' #'
                        )}`
                      : 'People in your pod'}
                  </Text>

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <ScrollView style={{ maxHeight: height * 0.34 }}>
                      {suggestions.map(({ member, score }) => {
                        const already = (invitesByBlocker[
                          askBlocker?.id ?? ''
                        ] ?? {})[member.id];
                        return (
                          <View key={member.id} style={styles.helperRow}>
                            <View style={styles.helperInfo}>
                              <View style={styles.helperAvatar}>
                                <Text style={styles.helperInitial}>
                                  {(member.name ?? 'U')[0]?.toUpperCase() ??
                                    'U'}
                                </Text>
                              </View>
                              <View style={styles.helperDetails}>
                                <Text style={styles.helperName}>
                                  {member.name}
                                </Text>
                                <View style={styles.helperMeta}>
                                  <View
                                    style={[
                                      styles.levelBadgeSmall,
                                      {
                                        backgroundColor:
                                          'rgba(255,255,255,0.08)',
                                      },
                                    ]}
                                  >
                                    <Text style={styles.levelTextSmall}>
                                      {member.level ?? 'Member'}
                                    </Text>
                                  </View>
                                  <Text style={styles.matchPercent}>
                                    {Math.round(score * 100)}% match
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {already ? (
                              <View
                                style={[
                                  styles.invBtnSecondary,
                                  { paddingHorizontal: 10 },
                                ]}
                              >
                                <Text style={styles.invBtnSecondaryText}>
                                  {already === 'pending' ? 'Invited' : already}
                                </Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={[
                                  styles.invBtnPrimary,
                                  { paddingHorizontal: 12 },
                                ]}
                                onPress={() =>
                                  askBlocker &&
                                  inviteHelper(askBlocker, member.id)
                                }
                              >
                                <Text style={styles.invBtnPrimaryText}>
                                  Invite
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Search + results */}
                  <TextInput
                    value={helpSearch}
                    onChangeText={setHelpSearch}
                    placeholder="Search by name or skill (e.g. react, nav, ios)…"
                    placeholderTextColor="#888"
                    style={styles.searchInput}
                  />

                  <ScrollView
                    style={{ maxHeight: height * 0.34, marginTop: 8 }}
                  >
                    {searchResults.map((m) => {
                      const already = (invitesByBlocker[askBlocker?.id ?? ''] ??
                        {})[m.id];
                      return (
                        <View key={m.id} style={styles.helperRow}>
                          <View style={styles.helperInfo}>
                            <View style={styles.helperAvatar}>
                              <Text style={styles.helperInitial}>
                                {(m.name ?? 'U')[0]?.toUpperCase() ?? 'U'}
                              </Text>
                            </View>
                            <View style={styles.helperDetails}>
                              <Text style={styles.helperName}>{m.name}</Text>
                              {!!m.tags?.length && (
                                <Text
                                  style={{ color: '#9aa0a6', fontSize: 11 }}
                                  numberOfLines={1}
                                >
                                  {m.tags
                                    .slice(0, 5)
                                    .map((t) => `#${t}`)
                                    .join(' ')}
                                </Text>
                              )}
                            </View>
                          </View>

                          {already ? (
                            <View
                              style={[
                                styles.invBtnSecondary,
                                { paddingHorizontal: 10 },
                              ]}
                            >
                              <Text style={styles.invBtnSecondaryText}>
                                {already === 'pending' ? 'Invited' : already}
                              </Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={[
                                styles.invBtnPrimary,
                                { paddingHorizontal: 12 },
                              ]}
                              onPress={() =>
                                askBlocker && inviteHelper(askBlocker, m.id)
                              }
                            >
                              <Text style={styles.invBtnPrimaryText}>
                                Invite
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                    {searchResults.length === 0 && (
                      <Text
                        style={{
                          color: '#888',
                          textAlign: 'center',
                          marginTop: 8,
                        }}
                      >
                        No matches. Try another name or skill.
                      </Text>
                    )}
                  </ScrollView>
                </View>
              </BlurView>
            </View>
          </View>
        </Modal>

        {/* Attach GitHub modal */}
        <Modal
          visible={attachOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAttachOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { width: width - 40 }]}>
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Text style={styles.modalTitle}>Attach GitHub link</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => setAttachOpen(false)}
                    >
                      <X color="#ffffff" size={20} />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 8 }}>
                    Paste a GitHub Issue/PR/Commit/Repo/Folder/File URL (e.g. https://github.com/owner/repo/blob/main/app/index.tsx)
                  </Text>

                  <TextInput
                    value={attachUrl}
                    onChangeText={setAttachUrl}
                    placeholder="https://github.com/owner/repo/tree/main/app"
                    placeholderTextColor="#888"
                    style={styles.searchInput}
                    autoCapitalize="none"
                  />

                  <TextInput
                    value={attachTitle}
                    onChangeText={setAttachTitle}
                    placeholder="Optional title override"
                    placeholderTextColor="#888"
                    style={[styles.searchInput, { marginTop: 8 }]}
                  />

                  <TouchableOpacity
                    style={[styles.createButton, attachBusy && { opacity: 0.85, marginTop: 12 }]}
                    disabled={attachBusy}
                    onPress={async () => {
                      if (!podId || !attachFor) return;
                      if (!attachUrl.trim()) {
                        Alert.alert('Missing URL', 'Please paste a GitHub URL.');
                        return;
                      }
                      try {
                        setAttachBusy(true);
                        const { data, error } = await supabase.rpc('add_github_link', {
                          p_pod_id: podId,
                          p_url: attachUrl.trim(),
                          p_blocker_id: attachFor.id,
                          p_title: attachTitle.trim() || null,
                          p_metadata: {},
                        });
                        if (error) throw error;
                        const created = data as GithubLink;
                        setLinksByBlocker((prev) => {
                          const m = { ...(prev || {}) };
                          const arr = [...(m[attachFor.id] ?? [])];
                          if (!arr.find((x) => x.id === created.id)) {
                            arr.unshift(created);
                          }
                          m[attachFor.id] = arr;
                          return m;
                        });
                        setAttachOpen(false);
                      } catch (e: any) {
                        Alert.alert('Attach failed', e?.message ?? 'Could not attach link.');
                      } finally {
                        setAttachBusy(false);
                      }
                    }}
                  >
                    <Text style={styles.createButtonText}>
                      {attachBusy ? 'Saving…' : 'Attach'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </View>
        </Modal>

        {/* Repo Tree modal (GitHub-like) */}
        {podId && treeCtx && (
          <RepoTreeModal
            visible={treeOpen}
            onClose={() => setTreeOpen(false)}
            podId={podId}
            owner={treeCtx.owner}
            repo={treeCtx.repo}
            gitRef={treeCtx.ref}
            highlightPath={treeCtx.filePath}
          />
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 28, fontFamily: 'Inter-SemiBold', color: '#ffffff' },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header pill
  requestPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  requestPillText: { color: '#000', fontWeight: '800' },

  // Status chips
  statsStrip: { flexDirection: 'row', gap: 8 as any, marginBottom: 12 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statChipText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  // View chips
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  segActive: { backgroundColor: '#ffffff' },
  segText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 12 },
  segTextActive: { color: '#000' },

  // Composer
  composerGlass: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    marginBottom: 14,
  },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 as any },
  composerInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    color: '#fff',
    fontFamily: 'Inter-Regular',
  },
  raiseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  raiseBtnText: { color: '#000', fontWeight: '700' },

  // Triage
  triageRow: { marginTop: 10 },
  sevPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 8,
  },
  sevPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  triageTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6 as any,
    marginBottom: 6,
  },
  triageTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  triageTagText: { color: '#ddd', fontSize: 10 },
  triageNote: { color: '#cfcfcf', fontSize: 12, lineHeight: 18 },

  // Card
  cardContainer: { marginBottom: 20 },
  cardGlass: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blockerCard: { padding: 20 },
  blockerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#ffffff' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    marginLeft: 4,
  },

  blockerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 8,
  },
  blockerDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#cccccc',
    lineHeight: 20,
    marginBottom: 12,
  },

  aiHint: {
    flexDirection: 'row',
    gap: 8 as any,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,217,102,0.08)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,217,102,0.25)',
    marginBottom: 12,
  },
  aiHintText: { color: '#f5f0dc', flex: 1, fontSize: 12, lineHeight: 18 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  tag: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 4,
  },
  tagText: { fontSize: 10, fontFamily: 'Inter-Medium', color: '#ffffff' },

  // Inline invite banner
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(89, 217, 133, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(89, 217, 133, 0.25)',
    marginBottom: 10,
  },
  inviteBannerText: { color: '#cfead8', flex: 1, fontSize: 12 },

  // Card footer buttons
  cardFooter: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    gap: 8 as any,
  },
  footerBtnPrimary: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6 as any,
  },
  footerBtnPrimaryText: { color: '#000', fontWeight: '700' },
  footerBtnSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  footerBtnDanger: {
    flexBasis: 96,
    borderRadius: 12,
    backgroundColor: '#ffdbdb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  footerBtnDangerText: { color: '#111', fontWeight: '800' },

  // Helpers list (modal)
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  helperInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  helperAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  helperInitial: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  helperDetails: { flex: 1 },
  helperName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    marginBottom: 2,
  },
  helperMeta: { flexDirection: 'row', alignItems: 'center' },
  levelBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  levelTextSmall: { fontSize: 8, fontFamily: 'Inter-SemiBold' },
  matchPercent: { fontSize: 10, fontFamily: 'Inter-Regular', color: '#999999' },

  // Small invite buttons (reused)
  invBtnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  invBtnPrimaryText: { color: '#000', fontWeight: '800' },
  invBtnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  invBtnSecondaryText: { color: '#fff', fontWeight: '800' },

  // Modals shared
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: { width: width - 40, maxHeight: height * 0.8 },
  modalGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modal: { padding: 24 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockerInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    minHeight: 120,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginLeft: 8,
  },

  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    color: '#fff',
    fontFamily: 'Inter-Regular',
    marginTop: 10,
  },
});
