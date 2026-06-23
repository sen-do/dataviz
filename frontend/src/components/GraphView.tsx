import { useEffect, useMemo, useState } from "react";
import { CosmographProvider, Cosmograph, prepareCosmographData } from "@cosmograph/react";
import type { CosmographConfig } from "@cosmograph/react";
import { loadGraph } from "@/lib/data";
import { useGraphStore } from "@/store";
import { cosmographRef } from "@/graphRef";
import { COMMUNITY_COLORS } from "@/lib/colors";
import type { GraphNode, GraphEdge } from "@/types";

const LABEL_TOP_N = 40;

function buildCosmographConfig(nodes: GraphNode[], edges: GraphEdge[]): Promise<CosmographConfig> {
  // Scale betweenness to visible size range (5–20px)
  const bcMax = Math.max(...nodes.map((n) => n.betweenness_centrality)) || 1;
  const nodesForCosmo = nodes.map(({ source_docs: _, wikidata_description: __, ...rest }) => ({
    ...rest,
    _size: 5 + (rest.betweenness_centrality / bcMax) * 15,
  }));

  const dataConfig = {
    points: {
      pointIdBy: "id",
      pointLabelBy: "label",
      pointSizeBy: "_size",
      pointSizeStrategy: "direct" as const,
      pointColorBy: "community",
      pointColorStrategy: "categorical" as const,
      pointColorPalette: COMMUNITY_COLORS,
      pointClusterBy: "community",
    },
    links: {
      linkSourceBy: "source",
      linkTargetsBy: ["target"],
      linkWidthBy: "weight",
    },
  };

  return prepareCosmographData(
    dataConfig,
    nodesForCosmo as unknown as Record<string, unknown>[],
    edges as unknown as Record<string, unknown>[],
  ).then((result) => {
    if (!result) throw new Error("prepareCosmographData returned null");
    const { points, links, cosmographConfig } = result;
    return { ...cosmographConfig, points, links } as CosmographConfig;
  });
}

export function GraphView() {
  const setGraphData = useGraphStore((s) => s.setGraphData);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const egoMode = useGraphStore((s) => s.egoMode);
  const activeCommunities = useGraphStore((s) => s.activeCommunities);
  const minConnections = useGraphStore((s) => s.minConnections);

  const [fullNodes, setFullNodes] = useState<GraphNode[]>([]);
  const [fullEdges, setFullEdges] = useState<GraphEdge[]>([]);
  const [orderedNodes, setOrderedNodes] = useState<GraphNode[]>([]);
  const [cosmographConfig, setCosmographConfig] = useState<CosmographConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [zoomedIn, setZoomedIn] = useState(false);

  // Load full data once
  useEffect(() => {
    loadGraph()
      .then(({ orderedNodes: allNodes, edges: allEdges }) => {
        setFullNodes(allNodes);
        setFullEdges(allEdges);
        setGraphData(allNodes, allEdges);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [setGraphData]);

  // Rebuild cosmograph data whenever filter changes
  useEffect(() => {
    if (fullNodes.length === 0) return;

    const filteredNodes = fullNodes.filter(
      (n) => activeCommunities.has(n.community) && n.degree >= minConnections
    );
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = fullEdges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );

    setOrderedNodes(filteredNodes);
    setReady(false);
    buildCosmographConfig(filteredNodes, filteredEdges)
      .then(setCosmographConfig)
      .then(() => setReady(true));
  }, [fullNodes, fullEdges, activeCommunities, minConnections]);

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

  // Force-stop simulation after timeout (dense graphs never fully stabilize)
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      cosmographRef.current?.stop?.();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [ready]);

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

  if (!cosmographConfig || !ready) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm">
        {fullNodes.length ? "Updating…" : "Loading network…"}
      </div>
    );
  }

  return (
    <CosmographProvider>
      <Cosmograph
        ref={cosmographRef}
        {...cosmographConfig}
        {...{
          // Rendering
          background_color: "#0D1117",
          space_size: 8192,
          point_size_scale: 0.8,
          // Edges — white at low opacity; width from co-occurrence weight
          link_default_color: "#FFFFFF",
          link_opacity: 0.15,
          link_visibility_distance_range: [5, 80],
          link_visibility_min_transparency: 0.03,
          link_greyout_opacity: 0.03,
          scale_points_on_zoom: true,
          scale_links_on_zoom: true,
          // Labels — show cluster names when zoomed out, point labels when zoomed in
          show_labels: zoomedIn,
          show_top_labels: zoomedIn,
          show_labels_for: zoomedIn ? labelNodeIds : undefined,
          show_cluster_labels: !zoomedIn,
          point_label_color: "#ffffff",
          cluster_label_font_size: 14,
          scale_cluster_labels: true,
          // Physics — tuned for curated 1500-node graph
          simulation_gravity: 0.1,
          simulation_repulsion: 2.0,
          simulation_link_spring: 0.3,
          simulation_friction: 0.85,
          simulation_decay: 3000,
          simulation_repulsion_theta: 1.5,
          simulation_cluster: 0.5,
          // View
          fit_view_on_init: true,
          enable_simulation: true,
        } as CosmographConfig}
        onSimulationEnd={() => {
          cosmographRef.current?.stop?.();
        }}
        onZoom={() => {
          const zoom = cosmographRef.current?.getZoomLevel?.() ?? 0;
          setZoomedIn(zoom > 2.5);
        }}
        onPointClick={(index: number) => {
          const node = orderedNodes[index];
          if (!node) return;
          setSelectedNode(selectedNodeId === node.id ? null : node.id);
        }}
        onClick={() => {
          if (!selectedNodeId) return;
          setSelectedNode(null);
        }}
      />
    </CosmographProvider>
  );
}
