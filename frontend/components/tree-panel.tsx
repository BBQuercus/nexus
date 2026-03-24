'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message, TreeNode, ConversationTree } from '@/lib/types';
import { GitBranch, User, Zap, ChevronDown, MoreHorizontal } from 'lucide-react';

/* ── Layout types ─────────────────────────────────────────────── */

interface LayoutNode {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  preview: string;
  branchIndex: number;
  childCount: number;
  x: number;
  y: number;
  isActivePath: boolean;
  isActiveLeaf: boolean;
  children: LayoutNode[];
  /** Collapsed segment: represents N sequential non-branching messages */
  collapsed?: { count: number; ids: string[] };
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isActivePath: boolean;
}

/* ── Layout constants ─────────────────────────────────────────── */

const NODE_HEIGHT = 44;
const NODE_WIDTH = 160;
const NODE_GAP_Y = 16;
const LANE_GAP_X = 24;
const PADDING_X = 24;
const PADDING_Y = 16;
const COLLAPSE_THRESHOLD = 4; // collapse runs of > this many linear messages

/* ── Tree layout engine ──────────────────────────────────────── */

function buildTree(tree: ConversationTree): {
  nodes: LayoutNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  if (!tree.nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };

  const nodeMap = new Map<string, TreeNode>();
  const childMap = new Map<string | null, TreeNode[]>();
  for (const n of tree.nodes) {
    nodeMap.set(n.id, n);
    const children = childMap.get(n.parentId) || [];
    children.push(n);
    childMap.set(n.parentId, children);
  }
  for (const [, children] of childMap) children.sort((a, b) => a.branchIndex - b.branchIndex);

  // Active path
  const activePath = new Set<string>();
  let cur: string | null = tree.activeLeafId;
  while (cur) {
    activePath.add(cur);
    cur = nodeMap.get(cur)?.parentId || null;
  }

  const roots = childMap.get(null) || [];
  let leafCounter = 0;

  function layout(nodeId: string, depth: number): LayoutNode {
    const n = nodeMap.get(nodeId)!;
    const rawChildren = childMap.get(nodeId) || [];
    let children = rawChildren.map((c) => layout(c.id, depth + 1));

    // Collapse long linear stretches: if this node has exactly 1 child,
    // which also has exactly 1 child, etc, collapse the run.
    if (children.length === 1 && children[0].children.length <= 1 && children[0].childCount <= 1) {
      const run: LayoutNode[] = [];
      let walk = children[0];
      while (walk && walk.childCount <= 1 && walk.children.length <= 1) {
        run.push(walk);
        walk = walk.children[0];
        if (!walk) break;
      }
      if (run.length >= COLLAPSE_THRESHOLD) {
        const collapsedIds = run.map((r) => r.id);
        const lastOfRun = run[run.length - 1];
        const remainingChildren = lastOfRun.children;
        // Replace the run with a single collapsed node
        const collapsed: LayoutNode = {
          id: `collapsed-${collapsedIds[0]}`,
          parentId: nodeId,
          role: 'assistant',
          preview: '',
          branchIndex: 0,
          childCount: remainingChildren.length,
          x: 0, y: 0,
          isActivePath: collapsedIds.some((id) => activePath.has(id)),
          isActiveLeaf: false,
          children: remainingChildren,
          collapsed: { count: collapsedIds.length, ids: collapsedIds },
        };
        children = [collapsed];
      }
    }

    let x: number;
    if (children.length === 0) {
      x = leafCounter * (NODE_WIDTH + LANE_GAP_X);
      leafCounter++;
    } else {
      x = (children[0].x + children[children.length - 1].x) / 2;
    }

    const layoutNode: LayoutNode = {
      id: n.id,
      parentId: n.parentId,
      role: n.role,
      preview: n.preview,
      branchIndex: n.branchIndex,
      childCount: n.childCount,
      x: x + PADDING_X,
      y: depth * (NODE_HEIGHT + NODE_GAP_Y) + PADDING_Y,
      isActivePath: activePath.has(n.id),
      isActiveLeaf: n.id === tree.activeLeafId,
      children,
    };

    // Recompute y for children based on the collapsed layout depth
    let childDepth = depth + 1;
    function fixDepth(nodes: LayoutNode[], d: number) {
      for (const child of nodes) {
        child.y = d * (NODE_HEIGHT + NODE_GAP_Y) + PADDING_Y;
        fixDepth(child.children, d + 1);
      }
    }
    fixDepth(children, childDepth);

    return layoutNode;
  }

  const layoutRoots = roots.map((r) => layout(r.id, 0));

  // Flatten
  const allNodes: LayoutNode[] = [];
  const allEdges: Edge[] = [];

  function flatten(node: LayoutNode) {
    allNodes.push(node);
    for (const child of node.children) {
      allEdges.push({
        x1: node.x + NODE_WIDTH / 2,
        y1: node.y + NODE_HEIGHT,
        x2: child.x + NODE_WIDTH / 2,
        y2: child.y,
        isActivePath: node.isActivePath && child.isActivePath,
      });
      flatten(child);
    }
  }
  for (const root of layoutRoots) flatten(root);

  const maxX = allNodes.length ? Math.max(...allNodes.map((n) => n.x + NODE_WIDTH)) + PADDING_X : 200;
  const maxY = allNodes.length ? Math.max(...allNodes.map((n) => n.y + NODE_HEIGHT)) + PADDING_Y : 100;

  return { nodes: allNodes, edges: allEdges, width: maxX, height: maxY };
}

/* ── Helper: map raw messages ────────────────────────────────── */

function mapMessages(raw: Record<string, unknown>[], conversationId: string): Message[] {
  return raw.map((m) => ({
    id: (m.id as string) || '',
    conversationId,
    role: (m.role as 'user' | 'assistant' | 'system') || 'user',
    content: (m.content as string) || '',
    createdAt: (m.created_at as string) || '',
    reasoning: (m.reasoning as string) || undefined,
    toolCalls: (m.tool_calls as Message['toolCalls']) || undefined,
    images: (m.images as Message['images']) || undefined,
    feedback: (m.feedback as Message['feedback']) || undefined,
    parentId: (m.parent_id as string) || undefined,
    branchIndex: (m.branch_index as number) ?? undefined,
  }));
}

/* ── Curved edge path ────────────────────────────────────────── */

function edgePath(e: Edge): string {
  const midY = (e.y1 + e.y2) / 2;
  if (Math.abs(e.x1 - e.x2) < 1) {
    // Straight vertical
    return `M${e.x1},${e.y1} L${e.x2},${e.y2}`;
  }
  // Cubic bezier for branches
  return `M${e.x1},${e.y1} C${e.x1},${midY} ${e.x2},${midY} ${e.x2},${e.y2}`;
}

/* ── Node card component ─────────────────────────────────────── */

function NodeCard({
  node,
  isHovered,
  onHover,
  onClick,
}: {
  node: LayoutNode;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  if (node.collapsed) {
    return (
      <foreignObject x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
        <div
          onClick={onClick}
          onMouseEnter={() => onHover(node.id)}
          onMouseLeave={() => onHover(null)}
          className={`h-full flex items-center justify-center gap-2 rounded-lg border border-dashed cursor-pointer transition-all ${
            node.isActivePath
              ? 'border-accent/30 bg-accent/5 text-accent'
              : 'border-border-default/50 bg-surface-0/50 text-text-tertiary'
          } ${isHovered ? 'border-accent/50 bg-accent/10' : ''}`}
        >
          <MoreHorizontal size={12} />
          <span className="text-[10px] font-mono">{node.collapsed.count} messages</span>
          <ChevronDown size={10} />
        </div>
      </foreignObject>
    );
  }

  const isUser = node.role === 'user';

  return (
    <foreignObject x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
      <div
        onClick={onClick}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        className={`
          h-full flex flex-col justify-center rounded-lg border px-3 py-1.5 cursor-pointer transition-all overflow-hidden
          ${node.isActiveLeaf
            ? 'border-accent bg-accent/10 shadow-[0_0_12px_-4px_var(--color-accent-dim)]'
            : node.isActivePath
              ? 'border-accent/40 bg-accent/5'
              : 'border-border-default/60 bg-surface-0/80'
          }
          ${isHovered && !node.isActiveLeaf ? 'border-accent/60 bg-accent/8 scale-[1.02]' : ''}
        `}
      >
        {/* Role label */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {isUser ? (
            <User size={9} className={node.isActivePath ? 'text-accent' : 'text-text-tertiary'} />
          ) : (
            <Zap size={9} className={node.isActivePath ? 'text-accent' : 'text-text-tertiary'} />
          )}
          <span className={`text-[9px] font-bold uppercase tracking-wider ${
            node.isActivePath ? 'text-accent' : 'text-text-tertiary'
          }`}>
            {isUser ? 'You' : 'AI'}
          </span>
          {node.childCount > 1 && (
            <span className="ml-auto flex items-center gap-0.5 text-[9px] text-accent/70 font-mono">
              <GitBranch size={8} />
              {node.childCount}
            </span>
          )}
          {node.isActiveLeaf && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          )}
        </div>
        {/* Preview */}
        <p className={`text-[10px] leading-tight truncate ${
          node.isActivePath ? 'text-text-secondary' : 'text-text-tertiary/70'
        }`}>
          {node.preview || (isUser ? 'User message' : 'AI response')}
        </p>
      </div>
    </foreignObject>
  );
}

/* ── Main panel ──────────────────────────────────────────────── */

export default function TreePanel() {
  const tree = useStore((s) => s.conversationTree);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setActiveLeafId = useStore((s) => s.setActiveLeafId);
  const setConversationTree = useStore((s) => s.setConversationTree);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    if (!tree) return { nodes: [], edges: [], width: 0, height: 0 };
    return buildTree(tree);
  }, [tree]);
  const { nodes, edges, width, height } = layout;

  // Center on root node when tree changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || nodes.length === 0) return;
    const root = nodes[0];
    // Center the root node horizontally and show it near the top vertically
    const rootCenterX = root.x + NODE_WIDTH / 2;
    const scrollLeft = rootCenterX - container.clientWidth / 2;
    const scrollTop = Math.max(0, root.y - 12);
    container.scrollTo({ left: Math.max(0, scrollLeft), top: scrollTop, behavior: 'instant' });
  }, [nodes]);

  const branchCount = useMemo(() => {
    if (!tree) return 0;
    return tree.nodes.filter((n) => n.childCount > 1).length;
  }, [tree]);

  const totalMessages = tree?.nodes.length ?? 0;

  const switchToBranch = useCallback(async (nodeId: string) => {
    if (!activeConversationId || !tree) return;

    // Walk down to deepest leaf from this node
    const childMap = new Map<string, TreeNode[]>();
    for (const n of tree.nodes) {
      if (n.parentId) {
        const existing = childMap.get(n.parentId) || [];
        existing.push(n);
        childMap.set(n.parentId, existing);
      }
    }
    let leafId = nodeId;
    // If it's a collapsed node, use the first id
    if (nodeId.startsWith('collapsed-')) {
      const realId = nodeId.replace('collapsed-', '');
      leafId = realId;
    }
    let children = childMap.get(leafId);
    while (children && children.length > 0) {
      children.sort((a, b) => a.branchIndex - b.branchIndex);
      leafId = children[0].id;
      children = childMap.get(leafId);
    }

    try {
      const result = await api.switchBranch(activeConversationId, leafId);
      setMessages(mapMessages(result.messages || [], activeConversationId));
      setActiveLeafId(result.active_leaf_id);
      const newTree = await api.getConversationTree(activeConversationId);
      setConversationTree(newTree);
    } catch (e) {
      console.error('Failed to switch branch:', e);
    }
  }, [activeConversationId, tree, setMessages, setActiveLeafId, setConversationTree]);

  /* ── Empty states ────────────────────────────────────────── */

  if (!tree || nodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader messageCount={0} branchCount={0} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="w-10 h-10 rounded-lg bg-surface-1 border border-border-default flex items-center justify-center">
            <GitBranch size={16} className="text-text-tertiary" />
          </div>
          <p className="text-xs text-text-tertiary">No conversation yet</p>
        </div>
      </div>
    );
  }

  if (branchCount === 0) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader messageCount={totalMessages} branchCount={0} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="w-10 h-10 rounded-lg bg-accent/5 border border-accent/20 flex items-center justify-center">
            <GitBranch size={16} className="text-accent/50" />
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Linear conversation</p>
            <p className="text-[10px] text-text-tertiary/60 leading-relaxed">
              Click <span className="text-accent font-semibold">New Branch</span> on any message to explore alternate paths
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Tree view ───────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-full">
      <PanelHeader messageCount={totalMessages} branchCount={branchCount} />

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <svg
          width={Math.max(width, 200)}
          height={Math.max(height, 100)}
          className="select-none"
        >
          {/* Edges — curved connectors */}
          {edges.map((e, i) => (
            <path
              key={`edge-${i}`}
              d={edgePath(e)}
              fill="none"
              stroke={e.isActivePath ? 'var(--color-accent)' : 'var(--color-border-default)'}
              strokeWidth={e.isActivePath ? 2 : 1}
              strokeOpacity={e.isActivePath ? 0.6 : 0.25}
              strokeDasharray={e.isActivePath ? undefined : '4 3'}
            />
          ))}

          {/* Nodes — card style via foreignObject */}
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              isHovered={hoveredNode === node.id}
              onHover={setHoveredNode}
              onClick={() => switchToBranch(node.id)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ── Panel header ────────────────────────────────────────────── */

function PanelHeader({ messageCount, branchCount }: { messageCount: number; branchCount: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-default/50 shrink-0">
      <div className="flex items-center gap-2">
        <GitBranch size={12} className="text-accent" />
        <span className="text-[11px] font-bold text-text-primary tracking-wide">Conversation Tree</span>
      </div>
      <div className="flex-1" />
      {messageCount > 0 && (
        <div className="flex items-center gap-3 text-[10px] font-mono text-text-tertiary">
          <span>{messageCount} msg</span>
          {branchCount > 0 && (
            <span className="flex items-center gap-1 text-accent/70">
              <GitBranch size={8} /> {branchCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
