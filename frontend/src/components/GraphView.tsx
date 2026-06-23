import { useEffect, useMemo, useState } from "react";
import { CosmographProvider, Cosmograph, prepareCosmographData } from "@cosmograph/react";
import type { CosmographConfig } from "@cosmograph/react";
import { loadGraph } from "@/lib/data";
import { useGraphStore } from "@/store";
import { cosmographRef } from "@/graphRef";
import { COMMUNITY_COLORS } from "@/lib/colors";
import type { GraphNode, GraphEdge } from "@/types";

// Only label the top-N bridges even when zoomed in
const LABEL_TOP_N = 25;

// Only pass strong edges to Cosmograph for layout — reduces force-graph density
// so cluster repulsion can visually separate communities. All edges stay in the
// store for sidebar stats and neighbor computation.
const LAYOUT_EDGE_MIN_WEIGHT = 10;

function buildCosmographConfig(nodes: GraphNode[], edges: GraphEdge[]): Promise<CosmographConfig> {
  const bcMax = Math.max(...nodes.map((n) => n.betweenness_centrality)) || 1;

  // Power-law size scaling: makes Epstein visibly dominant,
  // intermediate bridges clearly larger than peripheral nodes.
  const nodesForCosmo = nodes.map(({ source_docs: _, wikidata_description: __, ...rest }) => ({
    ...rest,
    _size: 3 + Math.pow(rest.betweenness_centrality / bcMax, 0.35) * 27,
  }));

  // Only strong co-occurrence edges drive the physics layout.
  const layoutEdges = edges.filter((e) => e.weight >= LAYOUT_EDGE_MIN_WEIGHT);

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
    layoutEdges as unknown as Record<string, unknown>[],
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

  useEffect(() => {
    if (!selectedNodeId) cosmographRef.current?.unselectAllPoints?.();
  }, [selectedNodeId]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      cosmographRef.current?.stop?.();
    }, 45_000);
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
          background_color: "#0D1117",
          space_size: 16384,
          point_size_scale: 0.9,
          // Edges — subtle white, visible only when nearby
          link_default_color: "#FFFFFF",
          link_opacity: 0.12,
          link_visibility_distance_range: [5, 100],
          link_visibility_min_transparency: 0.02,
          link_greyout_opacity: 0.02,
          scale_points_on_zoom: true,
          scale_links_on_zoom: true,
          // Labels — cluster overview vs node names when zoomed in
          show_labels: zoomedIn,
          show_top_labels: zoomedIn,
          show_labels_for: zoomedIn ? labelNodeIds : undefined,
          show_cluster_labels: !zoomedIn,
          point_label_color: "#ffffff",
          cluster_label_font_size: 16,
          scale_cluster_labels: true,
          // Physics — strong community clustering, weak link spring, wide repulsion
          // Goal: communities visually separate like islands, bridges visible between them
          simulation_gravity: 0.02,
          simulation_repulsion: 5.0,
          simulation_repulsion_theta: 1.7,
          simulation_link_spring: 0.05,
          simulation_link_distance: 10,
          simulation_friction: 0.85,
          simulation_decay: 8000,
          simulation_cluster: 3.0,
          fit_view_on_init: true,
          enable_simulation: true,
        } as CosmographConfig}
        onSimulationEnd={() => {
          cosmographRef.current?.stop?.();
        }}
        onZoom={() => {
          const zoom = cosmographRef.current?.getZoomLevel?.() ?? 0;
          setZoomedIn(zoom > 3.5);
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
