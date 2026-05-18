import { create } from "zustand";
import type { GraphNode, GraphEdge } from "@/types";

interface GraphStore {
  // Data — nodes order is preserved to match Cosmograph point indices
  nodes: GraphNode[];
  edges: GraphEdge[];
  allCommunities: Set<number>;
  setGraphData: (nodes: GraphNode[], edges: GraphEdge[]) => void;

  // Selection
  selectedNodeId: string | null;
  setSelectedNode: (id: string | null) => void;

  // Community visibility filter (toggled by chips)
  activeCommunities: Set<number>;
  toggleCommunity: (community: number) => void;
  setAllCommunities: (active: boolean) => void;

  // Ego-network mode (show only selected node + neighbours)
  egoMode: boolean;
  setEgoMode: (on: boolean) => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  allCommunities: new Set(),
  setGraphData: (nodes, edges) => {
    const communities = new Set(nodes.map((n) => n.community));
    set({ nodes, edges, allCommunities: communities, activeCommunities: new Set(communities) });
  },

  selectedNodeId: null,
  setSelectedNode: (id) => set({ selectedNodeId: id, egoMode: false }),

  activeCommunities: new Set(),
  toggleCommunity: (community) => {
    const next = new Set(get().activeCommunities);
    if (next.has(community)) next.delete(community);
    else next.add(community);
    set({ activeCommunities: next });
  },
  setAllCommunities: (active) => {
    set({ activeCommunities: active ? new Set(get().allCommunities) : new Set() });
  },

  egoMode: false,
  setEgoMode: (on) => set({ egoMode: on }),
}));

export function useSelectedNode(): GraphNode | null {
  return useGraphStore((s) =>
    s.selectedNodeId ? (s.nodes.find((n) => n.id === s.selectedNodeId) ?? null) : null
  );
}
