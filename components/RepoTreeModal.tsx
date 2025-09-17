import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { X, Folder, File, RefreshCcw, Search, ExternalLink } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { buildTree as externalBuildTree, TreeNode } from "@/utils/github";

type Props = {
  visible: boolean;
  onClose: () => void;
  podId: string;
  owner: string;
  repo: string;
  gitRef?: string;
  highlightPath?: string;
};

type Item = { path: string; type: "blob" | "tree" };

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const LIST_MAX_HEIGHT = Math.min(520, Math.floor(SCREEN_HEIGHT * 0.6));

// ---------- helpers
const cleanPath = (p: string) => String(p || "").trim().replace(/^\/+/, "");
const isTree = (t: string) => /^(tree|dir|folder)$/i.test(t);
const isBlob = (t: string) => /^(blob|file)$/i.test(t);

function normalizeItems(raw: any): Item[] {
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.tree)
    ? raw.tree
    : [];

  return arr
    .map((r) => {
      const rawType = String(r?.type ?? r?.kind ?? r?.node?.type ?? "").toLowerCase();
      const p0 = cleanPath(r?.path ?? r?.p ?? r?.name ?? r?.node?.path ?? "");
      let type: "blob" | "tree";
      if (isBlob(rawType)) type = "blob";
      else if (isTree(rawType)) type = "tree";
      else type = p0.includes(".") ? "blob" : "tree";
      return p0 ? { path: p0, type } : null;
    })
    .filter(Boolean) as Item[];
}

// children can be Map | Array | plain object — make it iterable
const childrenToArray = (node: any): any[] => {
  const c = node?.children;
  if (!c) return [];
  if (c instanceof Map) return Array.from(c.values());
  if (Array.isArray(c)) return c;
  if (typeof c === "object") return Object.values(c);
  return [];
};
const hasKids = (node: any) => childrenToArray(node).length > 0;

// very small fallback builder if external util returns an empty root
function fallbackBuildTree(items: Item[]): TreeNode {
  const root: any = { name: "", path: "", type: "tree", open: true, children: new Map() };
  for (const it of items) {
    const parts = cleanPath(it.path).split("/").filter(Boolean);
    let cur = root;
    parts.forEach((name, i) => {
      const atLeaf = i === parts.length - 1;
      if (atLeaf) {
        const node =
          it.type === "tree"
            ? { name, path: parts.slice(0, i + 1).join("/"), type: "tree", open: false, children: new Map() }
            : { name, path: parts.slice(0, i + 1).join("/"), type: "blob" };
        cur.children.set(name, node);
      } else {
        let next = cur.children.get(name);
        if (!next) {
          next = { name, path: parts.slice(0, i + 1).join("/"), type: "tree", open: false, children: new Map() };
          cur.children.set(name, next);
        }
        cur = next;
      }
    });
  }
  return root as TreeNode;
}

function robustBuildTree(items: Item[]): TreeNode {
  let built: any;
  try {
    built = externalBuildTree(items);
  } catch {}
  if (!built || !hasKids(built)) {
    built = fallbackBuildTree(items);
  }
  return built as TreeNode;
}

const TreeItemRow: React.FC<{
  node: TreeNode;
  depth: number;
  onToggle: (node: TreeNode) => void;
  highlightPath?: string;
  onOpenFile: (node: TreeNode) => void;
}> = ({ node, depth, onToggle, highlightPath, onOpenFile }) => {
  const isDir = node.type === "tree";
  const isHit = !!highlightPath && node.path === highlightPath;
  return (
    <TouchableOpacity
      onPress={() => (isDir ? onToggle(node) : onOpenFile(node))}
      style={[styles.row, { paddingLeft: 12 + depth * 14 }]}
      activeOpacity={0.7}
    >
      {isDir ? <Folder size={14} color="#c9d1d9" /> : <File size={14} color="#c9d1d9" />}
      <Text style={[styles.rowText, isHit && styles.rowTextHit]} numberOfLines={1}>
        {node.name || node.path || "/"}
      </Text>
    </TouchableOpacity>
  );
};

export default function RepoTreeModal(props: Props) {
  const { visible, onClose, podId, owner, repo, gitRef, highlightPath } = props;
  const refName = (gitRef && gitRef.trim()) || "main";

  const [loading, setLoading] = useState(false);
  const [root, setRoot] = useState<TreeNode | null>(null);
  const [q, setQ] = useState("");
  const [sourceNote, setSourceNote] = useState<"edge" | "github" | null>(null);
  const [itemCount, setItemCount] = useState(0);

  // ---- primary: Supabase function
  const fetchFromEdge = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("github-tree", {
      body: { pod_id: podId, owner, repo, ref: refName },
    });
    if (error) throw error;

    const items = normalizeItems(data);
    if (!items.length) throw new Error("No items from edge");

    setItemCount(items.length);
    let built = robustBuildTree(items);
    built.open = true;

    if (highlightPath) {
      const parts = cleanPath(highlightPath).split("/").filter(Boolean);
      let cur: any = built;
      for (const name of parts) {
        const kid = childrenToArray(cur).find((c: any) => c.name === name);
        if (!kid) break;
        if (kid.type === "tree") kid.open = true;
        cur = kid;
      }
    }

    setRoot(built);
    setSourceNote("edge");
  }, [podId, owner, repo, refName, highlightPath]);

  // ---- fallback: GitHub Trees API
  const fetchFromGitHub = useCallback(async () => {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      refName
    )}?recursive=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = await res.json();
    const items = normalizeItems(json?.tree);
    setItemCount(items.length);

    let built = robustBuildTree(items);
    built.open = true;
    setRoot(built);
    setSourceNote("github");
  }, [owner, repo, refName]);

  const fetchTree = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    setRoot(null);
    setItemCount(0);
    setSourceNote(null);
    try {
      await fetchFromEdge();
    } catch {
      try {
        await fetchFromGitHub();
      } catch (e: any) {
        Alert.alert("GitHub", e?.message ?? "Could not fetch repo tree (Edge + GitHub failed).");
      }
    } finally {
      setLoading(false);
    }
  }, [visible, fetchFromEdge, fetchFromGitHub]);

  useEffect(() => {
    if (visible) fetchTree();
  }, [visible, fetchTree]);

  const toggle = (n: TreeNode) => {
    (n as any).open = !(n as any).open;
    setRoot((r) => (r ? { ...r } : r));
  };

  const flat = useMemo(() => {
    const out: (TreeNode & { _depth: number })[] = [];
    const walk = (node: any, depth: number) => {
      if (node !== root) out.push(Object.assign({ _depth: depth }, node));
      if (node.type === "tree" && node.open) {
        const kids = childrenToArray(node).sort((a: any, b: any) => {
          if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
          return (a.name || "").localeCompare(b.name || "");
        });
        for (const k of kids) walk(k, depth + 1);
      }
    };
    if (root) walk(root as any, 0);
    return out;
  }, [root]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return flat;
    return flat.filter((n) => n.path.toLowerCase().includes(term));
  }, [flat, q]);

  const onOpenFile = (n: TreeNode) => {
    const url = `https://github.com/${owner}/${repo}/blob/${refName}/${n.path}`;
    Alert.alert("Open file", `Open ${n.path} on GitHub?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open",
        onPress: async () => {
          const { openBrowserAsync } = await import("expo-web-browser");
          openBrowserAsync(url);
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={30} style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {owner}/{repo}@{refName}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.iconBtn} onPress={fetchTree} disabled={loading}>
                {loading ? <ActivityIndicator /> : <RefreshCcw size={16} color="#000" />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
                <X size={16} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchRow}>
            <Search size={14} color="#666" />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search path…"
              placeholderTextColor="#888"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.iconBtn, { paddingHorizontal: 10 }]}
              onPress={async () => {
                const url = `https://github.com/${owner}/${repo}/tree/${refName}`;
                const { openBrowserAsync } = await import("expo-web-browser");
                openBrowserAsync(url);
              }}
            >
              <ExternalLink size={16} color="#000" />
            </TouchableOpacity>
          </View>

          {(sourceNote || itemCount) ? (
            <Text style={{ color: "#8ab4f8", fontSize: 10, paddingHorizontal: 12, paddingBottom: 6 }}>
              Source: {sourceNote === "edge" ? "Supabase Edge Function" : sourceNote === "github" ? "GitHub API" : "—"} • Items: {itemCount}
            </Text>
          ) : null}

          {/* The important fix: give this section a real height instead of flex:1 */}
          <View style={{ maxHeight: LIST_MAX_HEIGHT }}>
            {loading && !root ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                {filtered.map((n) => (
                  <TreeItemRow
                    key={n.path}
                    node={n}
                    depth={(n as any)._depth}
                    onToggle={toggle}
                    highlightPath={highlightPath}
                    onOpenFile={onOpenFile}
                  />
                ))}
                {filtered.length === 0 && (
                  <Text style={{ color: "#888", textAlign: "center", padding: 12 }}>
                    {q.trim() ? "No matches." : "No files found. Check repo/ref or function output."}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  sheet: { borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  header: { padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontFamily: "Inter-SemiBold", fontSize: 14 },
  iconBtn: { backgroundColor: "#fff", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  searchInput: { flex: 1, color: "#fff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingRight: 10, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.04)" },
  rowText: { color: "#c9d1d9", fontSize: 12, flexShrink: 1 },
  rowTextHit: { color: "#fff", fontWeight: "700", textDecorationLine: "underline" },
});
