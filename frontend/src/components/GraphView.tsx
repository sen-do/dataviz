import { useEffect, useMemo, useState } from "react";
import { CosmographProvider, Cosmograph } from "@cosmograph/react";
import type { CosmographConfig } from "@cosmograph/react";
import { loadGraph } from "@/lib/data";
import { useGraphStore } from "@/store";
import { cosmographRef } from "@/graphRef";
import type { GraphNode } from "@/types";

const LABEL_TOP_N = 30;

export function GraphView() {
  const setGraphData = useGraphStore((s) => s.setGraphData);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const egoMode = useGraphStore((s) => s.egoMode);

  const [baseConfig, setBaseConfig] = useState<CosmographConfig | null>(null);
  const [orderedNodes, setOrderedNodes] = useState<GraphNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGraph()
      .then(({ orderedNodes, edges, cosmographConfig }) => {
        setOrderedNodes(orderedNodes);
        setGraphData(orderedNodes, edges);
        setBaseConfig(cosmographConfig);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [setGraphData]);

  // Ego-network: imperatively select the node + its neighbours via ref.
  useEffect(() => {
    const ref = cosmographRef.current;
    if (!ref) return;
    if (!egoMode || !selectedNodeId) {
      ref.unselectAllPoints?.();
      return;
    }
    const idx = orderedNodes.findIndex((n) => n.id === selectedNodeId);
    if (idx >= 0) ref.selectPoint?.(idx, true, true);
  }, [egoMode, selectedNodeId, orderedNodes]);

  // Clear ego selection when node is deselected.
  useEffect(() => {
    if (!selectedNodeId) cosmographRef.current?.unselectAllPoints?.();
  }, [selectedNodeId]);

  const labelNodeIds = useMemo<string[]>(() => {
    if (!orderedNodes.length) return [];
    return [...orderedNodes]
      .sort((a, b) => b.betweenness_centrality - a.betweenness_centrality)
      .slice(0, LABEL_TOP_N)
      .map((n) => n.id);
  }, [orderedNodes]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-white/60 text-sm px-8 text-center">
        Failed to load graph: {error}
      </div>
    );
  }

  if (!baseConfig) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm">
        Loading network…
      </div>
    );
  }

  return (
    <CosmographProvider>
      <Cosmograph
        ref={cosmographRef}
        {...baseConfig}
        backgroundColor="#0D1117"
        showLabelsFor={labelNodeIds}
        onPointClick={(index: number) => {
          const node = orderedNodes[index];
          if (!node) return;
          setSelectedNode(selectedNodeId === node.id ? null : node.id);
        }}
        onClick={() => {
          if (!selectedNodeId) return;
          setSelectedNode(null);
        }}
        linkColor="#30363D"
        linkOpacity={0.6}
        simulationGravity={0.1}
        simulationRepulsion={1.5}
        simulationLinkSpring={0.5}
        simulationFriction={0.85}
      />
    </CosmographProvider>
  );
}
