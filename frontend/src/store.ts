import { create } from "zustand";
import type { GraphNode, GraphEdge } from "@/types";

interface GraphStore {
  nodes: GraphNode[];
  edges: GraphEdge[];
  allCommunities: Set<number>;
  setGraphData: (nodes: GraphNode[], edges: GraphEdge[]) => void;

  selectedNodeId: string | null;
  // Selecting any node always enables ego-mode and requests a fit-view — global behaviour.
  setSelectedNode: (id: string | null) => void;

  // Transient fit-view signal. Set by setSelectedNode, cleared by GraphView after zooming.
  panRequestId: string | null;
  clearPanRequest: () => void;

  activeCommunities: Set<number>;
  toggleCommunity: (community: number) => void;
  setAllCommunities: (active: boolean) => void;

  minConnections: number;
  setMinConnections: (n: number) => void;

  egoMode: boolean;
  setEgoMode: (on: boolean) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
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
  setSelectedNode: (id) => set({ selectedNodeId: id, egoMode: id !== null, panRequestId: id }),

  panRequestId: null,
  clearPanRequest: () => set({ panRequestId: null }),

  activeCommunities: new Set(),
  toggleCommunity: (community) => {
    const next = new Set(get().activeCommunities);
    if (next.has(community)) next.delete(community);
    else next.add(community);
    set({ activeCommunities: next });
  },
  setAllCommunities: (active) =>
    set({ activeCommunities: active ? new Set(get().allCommunities) : new Set() }),

  minConnections: 1,
  setMinConnections: (n) => set({ minConnections: n }),

  egoMode: false,
  setEgoMode: (on) => set({ egoMode: on }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

export function useSelectedNode(): GraphNode | null {
  return useGraphStore((s) =>
    s.selectedNodeId ? (s.nodes.find((n) => n.id === s.selectedNodeId) ?? null) : null
  );
}
