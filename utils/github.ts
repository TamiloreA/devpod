export function parseRepoOrFileUrl(url: string): null | {
    owner: string; repo: string; ref?: string; filePath?: string;
  } {
    try {
      const u = new URL(url.trim());
      if (u.hostname !== "github.com") return null;
      const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length >= 2 && parts[2] == null) {
        return { owner: parts[0], repo: parts[1] };
      }
      if (parts.length >= 5 && parts[2] === "blob") {
        const [owner, repo, _blob, ref, ...rest] = parts;
        return { owner, repo, ref, filePath: rest.join("/") };
      }
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
      return null;
    } catch {
      return null;
    }
  }
  
  export type TreeItem = { path: string; type: "blob" | "tree" };
  export type TreeNode = {
    name: string;
    path: string;
    type: "blob" | "tree";
    children?: Map<string, TreeNode>;
    open?: boolean;
  };
  
  export function buildTree(items: TreeItem[]): TreeNode {
    const root: TreeNode = { name: "", path: "", type: "tree", children: new Map(), open: true };
    for (const it of items) {
      const parts = it.path.split("/");
      let cur = root;
      let cum = "";
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        cum = cum ? `${cum}/${name}` : name;
        const isLeaf = i === parts.length - 1;
        if (!cur.children) cur.children = new Map();
        if (!cur.children.has(name)) {
          cur.children.set(name, {
            name,
            path: cum,
            type: isLeaf ? it.type : "tree",
            children: isLeaf ? undefined : new Map<string, TreeNode>(),
            open: false,
          });
        }
        cur = cur.children.get(name)!;
      }
    }
    return root;
  }
  