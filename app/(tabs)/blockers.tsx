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
  Pressable,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
} from 'react-native';
import type { TextInput as RNTextInput } from 'react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
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
  Clock,
  X,
  Send,
  Lightbulb,
  MessageSquare,
  UserPlus,
  GitBranch,
  Folder,
  File,
  Link as LinkIcon,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import ConnectJiraButton from '@/components/ConnectJiraButton';
import { useJiraConnected } from '@/hooks/useJiraConnected';
import { jiraLinkIssue, jiraCreateIssue } from '@/lib/jira';
import RepoTreeModal from '@/components/RepoTreeModal';

import SyntaxHighlighter from 'react-native-syntax-highlighter';

let atomOneDark: any;
try {
  // most common in v2
  atomOneDark = require('react-native-syntax-highlighter/src/styles/hljs').atomOneDark;
} catch {
  try {
    // some builds publish without /src
    atomOneDark = require('react-native-syntax-highlighter/styles/hljs').atomOneDark;
  } catch {
    atomOneDark = {}; // fallback: no colors, but no crash
  }
}

type HLJSTheme = Record<string, any>;
let theme: HLJSTheme | undefined;

try {
  // Most RN builds export here
  const pack = require('react-native-syntax-highlighter/src/styles/hljs');
  theme = pack?.atomOneDark ?? pack?.default?.atomOneDark ?? pack?.['atomOneDark'];
} catch {}

if (!theme) {
  try {
    // Some builds export here (no /src)
    const pack = require('react-native-syntax-highlighter/styles/hljs');
    theme = pack?.atomOneDark ?? pack?.default?.atomOneDark ?? pack?.['atomOneDark'];
  } catch {}
}

// Minimal safe fallback so style.hljs is ALWAYS defined
if (!theme) {
  theme = {
    hljs: { background: 'transparent', color: '#e6edf3' },
    comment: { color: '#7f848e', fontStyle: 'italic' },
    keyword: { color: '#c678dd' },
    string: { color: '#98c379' },
    number: { color: '#d19a66' },
    title: { color: '#61afef' },
    attr: { color: '#d19a66' },
    built_in: { color: '#e5c07b' },
    variable: { color: '#e06c75' },
    'template-variable': { color: '#e06c75' },
    literal: { color: '#56b6c2' },
    meta: { color: '#abb2bf' },
    section: { color: '#e5c07b' },
    emphasis: { fontStyle: 'italic' },
    strong: { fontWeight: '700' },
  } as HLJSTheme;
}

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

type JiraLink = {
  blocker_id: string;
  issue_key: string;
  issue_url: string;
  summary: string | null;
  status: string | null;
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

const parseRepoOrFileUrl = (
  raw: string
): { owner: string; repo: string; ref?: string; filePath?: string } | null => {
  try {
    const cleaned = raw.replace(/\s+/g, '');
    const u = new URL(cleaned);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;
    const [owner, repo, third, fourth, ...rest] = parts;

    if (third === 'blob' && fourth) {
      return {
        owner,
        repo,
        ref: fourth,
        filePath: rest.length ? rest.join('/') : undefined,
      };
    }

    if (third === 'tree' && fourth) {
      return {
        owner,
        repo,
        ref: fourth,
        filePath: rest.length ? rest.join('/') : undefined,
      };
    }

    return { owner, repo };
  } catch {
    return null;
  }
};

const GH_COLORS = [
  '#7bd88f',
  '#61afef',
  '#e06c75',
  '#c678dd',
  '#e5c07b',
  '#56b6c2',
];

function parseRefAndPathFromUrl(url: string): { ref?: string; path?: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts[2] === 'blob' || parts[2] === 'tree') {
      const ref = parts[3];
      const path = parts.slice(4).join('/');
      return { ref, path };
    }
    return {};
  } catch {
    return {};
  }
}

// --------- Description parsing/rendering with code blocks ----------

type DescPart =
  | { type: 'text'; text: string }
  | { type: 'code'; lang?: string; code: string };

function parseDescriptionIntoBlocks(src: string): DescPart[] {
  if (!src) return [];
  // Normalize newlines so iOS/CRLF copy-paste works
  const lines = src.replace(/\r\n?/g, '\n').split('\n');

  const out: DescPart[] = [];
  let buf: string[] = [];

  const flushText = () => {
    if (buf.length) {
      out.push({ type: 'text', text: buf.join('\n') });
      buf = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Allow indent, 2+ backticks OR 3+ tildes, optional language, then nothing else
    // examples: "```tsx", "  ``` js  ", "~~~", "   ``python"
    const open = line.match(/^\s*(`{2,}|~{3,})\s*([A-Za-z0-9_-]+)?\s*$/);
    if (!open) {
      buf.push(line);
      i++;
      continue;
    }

    const fenceChars = open[1][0]; // "`" or "~"
    const fenceLen = open[1].length;
    const lang = (open[2] || 'plaintext').toLowerCase();

    flushText();
    i++; // skip opening fence

    const body: string[] = [];
    const closeRe = new RegExp(`^\\s*\\${fenceChars}{${fenceLen},}\\s*$`);

    while (i < lines.length && !closeRe.test(lines[i])) {
      body.push(lines[i]);
      i++;
    }
    // skip the closing fence if present
    if (i < lines.length && closeRe.test(lines[i])) i++;

    out.push({
      type: 'code',
      lang,
      code: body.join('\n').replace(/\s+$/, ''),
    });
  }

  flushText();
  return out;
}


/** Render inline code (backticks) within a text chunk */
const TextWithInlineCode: React.FC<{ text: string }> = ({ text }) => {
  // split on single backticks while keeping the delimiters
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);

  return (
    <Text selectable style={styles.blockerDescription}>
      {parts.map((chunk, i) => {
        if (chunk.startsWith('`') && chunk.endsWith('`')) {
          const inner = chunk.slice(1, -1);
          return (
            <Text
              // inline code MUST be Text, not View
              key={`code-${i}`}
              style={codeStyles.inlineTextInText}
            >
              {inner}
            </Text>
          );
        }
        return <Text key={`t-${i}`}>{chunk}</Text>;
      })}
    </Text>
  );
};


const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  const language = (lang || 'plaintext').toLowerCase();
  const clean = (code || '').replace(/\s+$/, '');
  const lines = useMemo(() => clean.split('\n'), [clean]);
  const lineCount = clean ? lines.length : 0;

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {}
  };

  return (
    <View style={CB.outer}>
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={CB.glow}
      />
      <View style={CB.wrap}>
        {/* Header */}
        <View style={CB.header}>
          <View style={CB.winDots}>
            <View style={[CB.dot, { backgroundColor: '#ff5f56' }]} />
            <View style={[CB.dot, { backgroundColor: '#ffbd2e' }]} />
            <View style={[CB.dot, { backgroundColor: '#27c93f' }]} />
          </View>

          <View style={CB.headerCenter}>
            <Text style={CB.langPill}>
              {language}
              {lineCount ? ` • ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}` : ''}
            </Text>
          </View>

          <View style={CB.headerRight}>
            <TouchableOpacity
              onPress={onCopy}
              activeOpacity={0.9}
              style={[CB.toolBtn, copied && CB.toolBtnOk]}
            >
              <Text style={[CB.toolBtnTxt, copied && { color: '#59d985' }]}>
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Toolbar */}
        <View style={CB.toolbar}>
          <TouchableOpacity
            onPress={() => setWrap((v) => !v)}
            activeOpacity={0.85}
            style={[CB.chip, wrap && CB.chipOn]}
          >
            <Text style={[CB.chipTxt, wrap && CB.chipTxtOn]}>
              {wrap ? 'Unwrap' : 'Wrap'}
            </Text>
          </TouchableOpacity>

          {lineCount > 14 && (
            <TouchableOpacity
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.85}
              style={CB.chip}
            >
              <Text style={CB.chipTxt}>{expanded ? 'Collapse' : 'Expand'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Body */}
        <View style={[CB.body, !expanded && CB.bodyCollapsed]}>
          {!wrap ? (
            <ScrollView style={CB.vscroll} bounces={false} showsVerticalScrollIndicator={false}>
              <View style={CB.row}>
                <View style={CB.gutter}>
                  {lines.map((_, i) => (
                    <Text key={i} style={CB.gutterTxt}>
                      {i + 1}
                    </Text>
                  ))}
                </View>

                <ScrollView
                  horizontal
                  bounces={false}
                  showsHorizontalScrollIndicator={false}
                  style={CB.hscroll}
                >
                  <View style={{ paddingRight: 12 }}>
                    <SyntaxHighlighter
                      language={language}
                      style={theme}
                      highlighter="hljs"
                      PreTag={View as any}
                      CodeTag={Text as any}
                      customStyle={{ backgroundColor: 'transparent', padding: 0, margin: 0 }}
                      codeTagProps={{
                        selectable: true,
                        style: {
                          fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) as any,
                          fontSize: 12,
                          lineHeight: 20,
                        },
                      }}
                    >
                      {clean}
                    </SyntaxHighlighter>
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={CB.vscroll} bounces={false} showsVerticalScrollIndicator={false}>
              <View style={{ paddingHorizontal: 12 }}>
                <SyntaxHighlighter
                  language={language}
                  style={theme}
                  highlighter="hljs"
                  PreTag={View as any}
                  CodeTag={Text as any}
                  customStyle={{ backgroundColor: 'transparent', padding: 0, margin: 0 }}
                  codeTagProps={{
                    selectable: true,
                    style: {
                      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) as any,
                      fontSize: 12,
                      lineHeight: 20,
                    },
                  }}
                >
                  {clean}
                </SyntaxHighlighter>
              </View>
            </ScrollView>
          )}

          {!expanded && <LinearGradient colors={['rgba(17,19,23,0)', 'rgba(17,19,23,0.85)']} style={CB.fade} />}
        </View>
      </View>
    </View>
  );
};

const CB = StyleSheet.create({
  outer: { marginBottom: 12, borderRadius: 14, position: 'relative' },
  glow: { ...StyleSheet.absoluteFillObject, borderRadius: 14, opacity: 0.4 },
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#0f1216',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  winDots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, opacity: 0.9 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { width: 90, alignItems: 'flex-end' },

  langPill: {
    color: '#cfe0ff',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(31,111,235,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(31,111,235,0.35)',
    overflow: 'hidden',
  },

  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  toolBtnOk: {
    backgroundColor: 'rgba(89,217,133,0.16)',
    borderColor: 'rgba(89,217,133,0.4)',
  },
  toolBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  chipTxt: { color: '#e6edf3', fontWeight: '700', fontSize: 12 },
  chipTxtOn: { color: '#fff' },

  body: { position: 'relative' },
  bodyCollapsed: { maxHeight: 260 },
  vscroll: { maxWidth: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },

  gutter: {
    paddingLeft: 12,
    paddingRight: 10,
    paddingTop: 2,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gutterTxt: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) as any,
    fontSize: 11,
    lineHeight: 20,
    color: '#8a9199',
    textAlign: 'right',
  },
  hscroll: { flexGrow: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 },
});

const RichDescription: React.FC<{ text: string }> = ({ text }) => {
  const parts = useMemo(() => parseDescriptionIntoBlocks(text), [text]);
  if (!parts.length) return null;

  return (
    <View style={{ marginTop: 4, marginBottom: 12, position: 'relative', zIndex: 1 }}>
      {parts.map((p, i) =>
        p.type === 'code' ? (
          <CodeBlock key={`code-${i}`} code={p.code} lang={p.lang} />
        ) : (
          <View key={`text-${i}`} style={{ marginBottom: 6 }}>
            <TextWithInlineCode text={p.text} />
          </View>
        )
      )}
    </View>
  );
};

// ---------------- GitHub inline path renderer ----------------

function middleEllipsisSegments(segments: string[], max = 5) {
  if (segments.length <= max) return segments;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return [...segments.slice(0, head), '…', ...segments.slice(-tail)];
}

type RepoPathInlineProps = {
  link: GithubLink;
  onOpen: () => void;
  onOpenTree: () => void;
};

const RepoPathInline: React.FC<RepoPathInlineProps> = ({
  link,
  onOpen,
  onOpenTree,
}) => {
  const { ref, path } = useMemo(
    () => parseRefAndPathFromUrl(link.url),
    [link.url]
  );
  const segs = useMemo(
    () => middleEllipsisSegments((path || '').split('/').filter(Boolean), 5),
    [path]
  );

  return (
    <View style={inlineStyles.wrap}>
      <View style={inlineStyles.rail}>
        {Array.from({ length: Math.max(2, Math.min(segs.length || 2, 6)) }).map(
          (_, i) => (
            <View
              key={i}
              style={[
                inlineStyles.railDot,
                { backgroundColor: GH_COLORS[i % GH_COLORS.length] },
              ]}
            />
          )
        )}
      </View>

      <TouchableOpacity
        style={inlineStyles.main}
        activeOpacity={0.85}
        onPress={onOpen}
      >
        <Text style={inlineStyles.repoText} numberOfLines={1}>
          {link.owner}/{link.repo}
          {ref ? <Text style={inlineStyles.refText}>@{ref}</Text> : null}
        </Text>

        <View style={inlineStyles.breadcrumb}>
          {segs.length === 0 ? (
            <View
              style={[
                inlineStyles.pill,
                { borderColor: 'rgba(255,255,255,0.18)' },
              ]}
            >
              <Folder size={12} color="#d1d5db" />
              <Text style={inlineStyles.pillText}>/</Text>
            </View>
          ) : (
            segs.map((s, i) => {
              const isEllipsis = s === '…';
              const color = GH_COLORS[i % GH_COLORS.length];
              return (
                <View
                  key={`${s}-${i}`}
                  style={[
                    inlineStyles.pill,
                    {
                      borderColor: isEllipsis
                        ? 'rgba(255,255,255,0.18)'
                        : color,
                      backgroundColor: isEllipsis
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(255,255,255,0.04)',
                    },
                  ]}
                >
                  {isEllipsis ? (
                    <Text style={[inlineStyles.pillText, { marginLeft: 0 }]}>
                      …
                    </Text>
                  ) : i < segs.length - 1 ? (
                    <Folder size={12} color="#d1d5db" />
                  ) : (
                    <File size={12} color="#d1d5db" />
                  )}
                  {!isEllipsis && (
                    <Text style={inlineStyles.pillText} numberOfLines={1}>
                      {s}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={inlineStyles.treeBtn}
        onPress={onOpenTree}
        activeOpacity={0.85}
      >
        <GitBranch size={14} color="#000" />
        <Text style={inlineStyles.treeBtnText}>Tree</Text>
      </TouchableOpacity>
    </View>
  );
};

const inlineStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
    paddingVertical: 8,
  },
  rail: {
    width: 10,
    alignItems: 'center',
    gap: 3 as any,
  },
  railDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.95,
  },
  main: { flex: 1 },
  repoText: { color: '#cfcfcf', fontSize: 12, fontFamily: 'Inter-Medium' },
  refText: { color: '#9aa0a6', fontFamily: 'Inter-Regular' },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6 as any,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6 as any,
  },
  pillText: { color: '#dfe6ee', fontSize: 11, marginLeft: 2, maxWidth: 180 },
  treeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
  },
  treeBtnText: { color: '#000', fontWeight: '800', fontSize: 12 },
});

export default function BlockersScreen() {
  const params = useLocalSearchParams<{
    raise?: string;
    refreshConnections?: string;
  }>();

  const [authUid, setAuthUid] = useState<string | null>(null);
  const [podId, setPodId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);

  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [invitesByBlocker, setInvitesByBlocker] = useState<
    Record<string, Record<string, HelpInvite['status']>>
  >({});

  const [linksByBlocker, setLinksByBlocker] = useState<
    Record<string, GithubLink[]>
  >({});

  const [jiraByBlocker, setJiraByBlocker] = useState<
    Record<string, JiraLink[]>
  >({});

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'open' | 'helping' | 'resolved'
  >('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'forYou' | 'mine'>(
    'all'
  );
  const [q, setQ] = useState('');

  const [composeText, setComposeText] = useState('');
  const [triage, setTriage] = useState<{
    severity: 'low' | 'medium' | 'high';
    tags: string[];
    note: string;
  } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blockerText, setBlockerText] = useState('');
  const [creating, setCreating] = useState(false);

  const [askModalOpen, setAskModalOpen] = useState(false);
  const [askBlocker, setAskBlocker] = useState<BlockerRow | null>(null);
  const [helpSearch, setHelpSearch] = useState('');

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachFor, setAttachFor] = useState<BlockerRow | null>(null);
  const [attachUrl, setAttachUrl] = useState('');
  const [attachTitle, setAttachTitle] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);

  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraFor, setJiraFor] = useState<BlockerRow | null>(null);
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraKeyOrUrl, setJiraKeyOrUrl] = useState('');
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [jiraSummary, setJiraSummary] = useState('');
  const inputRef = useRef<RNTextInput>(null);

  const [treeOpen, setTreeOpen] = useState(false);
  const [treeCtx, setTreeCtx] = useState<{
    owner: string;
    repo: string;
    ref?: string;
    filePath?: string;
  } | null>(null);

  const rtBlockersRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const rtHelpRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rtInviteRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rtJiraRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [myHelp, setMyHelp] = useState<Record<string, HelpReq['status']>>({});

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const { connected: jiraConnected, refetch: refetchJiraConnected } =
    useJiraConnected();

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
            loadJiraLinks(p),
          ]);
          await preloadInvitesForBlockers(p, uid);
        } else {
          setBlockers([]);
          setMyHelp({});
          setMembers([]);
          setInvitesByBlocker({});
          setLinksByBlocker({});
          setJiraByBlocker({});
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
          if (!row || row.requester_user_id !== authUid) return;
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

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }, [])
  );

  useEffect(() => {
    if (!podId) return;
    if (rtJiraRef.current) {
      rtJiraRef.current.unsubscribe();
      rtJiraRef.current = null;
    }
    const ch = supabase
      .channel(`rt-jira:${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blocker_jira_links',
          filter: `pod_id=eq.${podId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row) return;
          setJiraByBlocker((prev) => {
            const copy = { ...prev };
            const arr = [...(copy[row.blocker_id] ?? [])];
            const idx = arr.findIndex((x) => x.issue_key === row.issue_key);
            if (payload.eventType === 'DELETE') {
              if (idx >= 0) arr.splice(idx, 1);
            } else {
              const entry: JiraLink = {
                blocker_id: row.blocker_id,
                issue_key: row.issue_key,
                issue_url: row.issue_url,
                summary: row.summary ?? null,
                status: row.status ?? null,
              };
              if (idx >= 0) arr[idx] = entry;
              else arr.unshift(entry);
            }
            copy[row.blocker_id] = arr;
            return copy;
          });
        }
      )
      .subscribe();
    rtJiraRef.current = ch;
    return () => {
      ch.unsubscribe();
      rtJiraRef.current = null;
    };
  }, [podId]);

  useEffect(() => {
    if (params.refreshConnections === '1') {
      refetchJiraConnected();
    }
  }, [params.refreshConnections, refetchJiraConnected]);

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

  const loadJiraLinks = useCallback(async (p: string) => {
    try {
      const { data, error } = await supabase
        .from('blocker_jira_links')
        .select('blocker_id, issue_key, issue_url, summary, status, updated_at')
        .eq('pod_id', p)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const grouped: Record<string, JiraLink[]> = {};
      (data ?? []).forEach((jl: any) => {
        (grouped[jl.blocker_id] ||= []).push({
          blocker_id: jl.blocker_id,
          issue_key: jl.issue_key,
          issue_url: jl.issue_url,
          summary: jl.summary ?? null,
          status: jl.status ?? null,
        });
      });
      setJiraByBlocker(grouped);
    } catch (e: any) {
      console.log('jira.list error', e?.message);
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
        loadJiraLinks(podId),
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
    loadJiraLinks,
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
      const { error } = await supabase.from('blocker_help_requests').insert([
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
      const { error } = await supabase.from('blocker_help_invites').insert([
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
          keyboardShouldPersistTaps="handled"
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
            </View>
          </Animated.View>

          {/* Status chips */}
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

          {/* View chips */}
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
              <Pressable
                style={{ flex: 1 }}
                onPress={() => inputRef.current?.focus()}
                onLongPress={() => (podId ? openModalPrefilled() : null)}
                delayLongPress={300}
              >
                <TextInput
                  ref={inputRef}
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
              </Pressable>

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
            const myReq = myHelp[b.id];
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
            const jiraLinks = jiraByBlocker[b.id] ?? [];

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
                      <RichDescription text={b.description} />
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

                    {/* Jira links */}
                    {jiraLinks.length > 0 && (
                      <View
                        style={{
                          marginBottom: 8,
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                        }}
                      >
                        {jiraLinks.map((jl) => (
                          <TouchableOpacity
                            key={`${b.id}-jira-${jl.issue_key}`}
                            style={styles.jiraChip}
                            onPress={() => Linking.openURL(jl.issue_url)}
                            activeOpacity={0.8}
                          >
                            <LinkIcon size={12} color="#cfe0ff" />
                            <Text style={styles.jiraChipText}>
                              {jl.issue_key}
                              {jl.status ? ` • ${jl.status}` : ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* GitHub links under this blocker */}
                    {ghLinks.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        {ghLinks.map((gl) => (
                          <RepoPathInline
                            key={gl.id}
                            link={gl}
                            onOpen={() => Linking.openURL(gl.url)}
                            onOpenTree={() => openRepoTreeFromUrl(gl.url)}
                          />
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

                      {/* Owner: Attach Jira */}
                      {owner && (
                        <TouchableOpacity
                          style={styles.footerBtnSecondary}
                          onPress={() => {
                            setJiraFor(b);
                            setJiraKeyOrUrl('');
                            setJiraProjectKey('');
                            setJiraSummary(b.title.slice(0, 180));
                            setJiraOpen(true);
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Text style={styles.footerBtnSecondaryText}>
                              Attach Jira
                            </Text>
                            {jiraConnected && (
                              <View style={styles.connectedDot} />
                            )}
                          </View>
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

        {/* Create modal (keyboard-aware + tap-to-dismiss) */}
        <Modal
          visible={showCreateModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowCreateModal(false)}
        >
          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={80}
                style={{ width: width - 40, maxHeight: height * 0.8 }}
              >
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
                        blurOnSubmit
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
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
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
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

                  <Text
                    style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 8 }}
                  >
                    Paste a GitHub Issue/PR/Commit/Repo/Folder/File URL (e.g.
                    https://github.com/owner/repo/blob/main/app/index.tsx)
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
                    style={[
                      styles.createButton,
                      attachBusy && { opacity: 0.85, marginTop: 12 },
                    ]}
                    disabled={attachBusy}
                    onPress={async () => {
                      if (!podId || !attachFor) return;
                      if (!attachUrl.trim()) {
                        Alert.alert(
                          'Missing URL',
                          'Please paste a GitHub URL.'
                        );
                        return;
                      }
                      try {
                        setAttachBusy(true);
                        const { data, error } = await supabase.rpc(
                          'add_github_link',
                          {
                            p_pod_id: podId,
                            p_url: attachUrl.trim(),
                            p_blocker_id: attachFor.id,
                            p_title: attachTitle.trim() || null,
                            p_metadata: {},
                          }
                        );
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
                        Alert.alert(
                          'Attach failed',
                          e?.message ?? 'Could not attach link.'
                        );
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

        {/* Attach Jira modal */}
        <Modal
          visible={jiraOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setJiraOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { width: width - 40 }]}>
              <BlurView intensity={30} style={styles.modalGlass}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Text style={styles.modalTitle}>Attach Jira</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => setJiraOpen(false)}
                    >
                      <X color="#ffffff" size={20} />
                    </TouchableOpacity>
                  </View>

                  {jiraConnected ? (
                    <>
                      <Text
                        style={{
                          color: '#cfe0ff',
                          fontSize: 12,
                          marginBottom: 6,
                        }}
                      >
                        Link an existing issue{' '}
                        <Text style={{ fontWeight: '700' }}>
                          (ISSUE-123 or URL)
                        </Text>
                      </Text>
                      <TextInput
                        value={jiraKeyOrUrl}
                        onChangeText={setJiraKeyOrUrl}
                        placeholder="ABC-123 or https://your-domain.atlassian.net/browse/ABC-123"
                        placeholderTextColor="#888"
                        style={styles.searchInput}
                        autoCapitalize="characters"
                      />
                      <TouchableOpacity
                        style={[
                          styles.createButton,
                          jiraBusy && { opacity: 0.85, marginTop: 12 },
                        ]}
                        disabled={jiraBusy}
                        onPress={async () => {
                          if (!jiraFor || !podId) return;
                          if (!jiraKeyOrUrl.trim()) {
                            Alert.alert(
                              'Missing issue',
                              'Enter an ISSUE-KEY or paste a Jira URL.'
                            );
                            return;
                          }
                          try {
                            setJiraBusy(true);
                            const link = await jiraLinkIssue(
                              jiraFor.id,
                              jiraKeyOrUrl.trim()
                            );
                            setJiraByBlocker((prev) => {
                              const arr = [...(prev[jiraFor.id] ?? [])];
                              if (
                                !arr.find((x) => x.issue_key === link.issue_key)
                              ) {
                                arr.unshift({
                                  blocker_id: jiraFor.id,
                                  issue_key: link.issue_key,
                                  issue_url: link.issue_url,
                                  status: link.status ?? null,
                                  summary: link.summary ?? null,
                                });
                              }
                              return { ...prev, [jiraFor.id]: arr };
                            });
                            setJiraOpen(false);
                          } catch (e: any) {
                            Alert.alert(
                              'Jira',
                              e?.message ?? 'Could not link issue.'
                            );
                          } finally {
                            setJiraBusy(false);
                          }
                        }}
                      >
                        <Text style={styles.createButtonText}>
                          {jiraBusy ? 'Linking…' : 'Link Issue'}
                        </Text>
                      </TouchableOpacity>

                      <View style={{ height: 14 }} />

                      <Text
                        style={{
                          color: '#cfe0ff',
                          fontSize: 12,
                          marginBottom: 6,
                        }}
                      >
                        Or create a new issue
                      </Text>
                      <TextInput
                        value={jiraProjectKey}
                        onChangeText={setJiraProjectKey}
                        placeholder="Project key (e.g. ABC)"
                        placeholderTextColor="#888"
                        style={styles.searchInput}
                        autoCapitalize="characters"
                      />
                      <TextInput
                        value={jiraSummary}
                        onChangeText={setJiraSummary}
                        placeholder="Summary"
                        placeholderTextColor="#888"
                        style={[styles.searchInput, { marginTop: 8 }]}
                      />
                      <TouchableOpacity
                        style={[
                          styles.createButton,
                          jiraBusy && { opacity: 0.85, marginTop: 12 },
                        ]}
                        disabled={jiraBusy}
                        onPress={async () => {
                          if (!jiraFor || !podId) return;
                          if (!jiraProjectKey.trim() || !jiraSummary.trim()) {
                            Alert.alert(
                              'Missing details',
                              'Enter a project key and summary.'
                            );
                            return;
                          }
                          try {
                            setJiraBusy(true);
                            const link = await jiraCreateIssue(
                              jiraFor.id,
                              jiraProjectKey.trim(),
                              jiraSummary.trim(),
                              jiraFor.description ?? undefined
                            );
                            setJiraByBlocker((prev) => {
                              const arr = [...(prev[jiraFor.id] ?? [])];
                              if (
                                !arr.find((x) => x.issue_key === link.issue_key)
                              ) {
                                arr.unshift({
                                  blocker_id: jiraFor.id,
                                  issue_key: link.issue_key,
                                  issue_url: link.issue_url,
                                  status: link.status ?? null,
                                  summary: link.summary ?? null,
                                });
                              }
                              return { ...prev, [jiraFor.id]: arr };
                            });
                            setJiraOpen(false);
                          } catch (e: any) {
                            Alert.alert(
                              'Jira',
                              e?.message ?? 'Could not create issue.'
                            );
                          } finally {
                            setJiraBusy(false);
                          }
                        }}
                      >
                        <Text style={styles.createButtonText}>
                          {jiraBusy ? 'Creating…' : 'Create Issue'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center' }}>
                      <Text
                        style={{
                          color: '#cfcfcf',
                          marginBottom: 12,
                          textAlign: 'center',
                        }}
                      >
                        Connect your Jira account to link or create issues.
                      </Text>
                      <ConnectJiraButton returnTo="/blockers?refreshConnections=1" />
                    </View>
                  )}
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
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1f6feb',
  },

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
    position: 'relative'
  },
  blockerCard: {
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  blockerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 2,
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
    zIndex: 2,
    
  },

  blockerDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#cccccc',
    lineHeight: 20,
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
    marginTop: 8,
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

  // Jira chip
  jiraChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(31,111,235,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(31,111,235,0.35)',
    marginRight: 8,
    marginBottom: 8,
  },
  jiraChipText: { color: '#cfe0ff', fontSize: 12, fontFamily: 'Inter-Medium' },

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
    flexWrap: 'wrap',
  },
  footerBtnPrimary: {
    flexBasis: '48%',
    minWidth: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6 as any,
  },
  footerBtnPrimaryText: { color: '#000', fontWeight: '700' },
  footerBtnSecondary: {
    flexBasis: '48%',
    minWidth: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  footerBtnDanger: {
    flexBasis: '48%',
    minWidth: '48%',
    borderRadius: 12,
    backgroundColor: '#ffdbdb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  footerBtnDangerText: { color: '#111', fontWeight: '800' },

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

const codeStyles = StyleSheet.create({
  outerWrap: {
    marginBottom: 12,
    borderRadius: 14,
    position: 'relative',
  },
  borderGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    opacity: 0.4,
  },
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#0f1216',      // deeper canvas
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { flexDirection: 'row', gap: 8 },
  
  langPill: {
    color: '#cfe0ff',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(31,111,235,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(31,111,235,0.35)',
    overflow: 'hidden',
  },
  
  /* small rectangular button in header (Copy) */
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  toolBtnActive: {
    backgroundColor: 'rgba(89,217,133,0.16)',
    borderColor: 'rgba(89,217,133,0.4)',
  },
  toolBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  
  /* toolbar under header */
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  toolChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  toolChipActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolChipText: { color: '#e6edf3', fontWeight: '700', fontSize: 12 },
  toolChipTextActive: { color: '#fff' },
  
  /* body + scrolling */
  body: { position: 'relative' },
  bodyCollapsed: { maxHeight: 260 },
  vscroll: { maxWidth: '100%' },
  codeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  gutter: {
    paddingLeft: 12,
    paddingRight: 10,
    paddingTop: 2,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gutterText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) as any,
    fontSize: 11,
    lineHeight: 20,
    color: '#8a9199',
    textAlign: 'right',
  },
  hscroll: { flexGrow: 1 },
  
  /* fade at bottom when collapsed */
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  
  codeCol: {
    paddingLeft: 10,
    paddingRight: 12,
    paddingTop: 2,
    flexShrink: 1,
  },

  winDotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  winDot: { width: 10, height: 10, borderRadius: 5, opacity: 0.9 },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  copyText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  // Footer
  footerBtn: {
    alignSelf: 'flex-end',
    margin: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  footerBtnText: { color: '#e6edf3', fontWeight: '800', fontSize: 12 },
  inlineTextInText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: '#e6edf3',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    // paddingVertical on Text stays inline without breaking layout
  },

  // Inline-code (unchanged API, nicer styling)
  inline: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inlineText: {
    color: '#e6edf3',
    fontFamily: 'Menlo',
    fontSize: 12,
  },
});

