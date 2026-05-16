import { prepareCosmographData } from "@cosmograph/react";
import type { CosmographConfig } from "@cosmograph/react";
import type { GraphNode, GraphEdge } from "@/types";
import { COMMUNITY_COLORS } from "@/lib/colors";

export interface PreparedGraph {
  // Ordered nodes array — preserves index → node mapping for onPointClick
  orderedNodes: GraphNode[];
  edges: GraphEdge[];
  cosmographConfig: CosmographConfig;
}

export async function loadGraph(): Promise<PreparedGraph> {
  const [nodesRes, edgesRes] = await Promise.all([
    fetch("/data/nodes.json"),
    fetch("/data/edges.json"),
  ]);

  if (!nodesRes.ok) throw new Error(`Failed to load nodes.json: ${nodesRes.status}`);
  if (!edgesRes.ok) throw new Error(`Failed to load edges.json: ${edgesRes.status}`);

  const nodes: GraphNode[] = await nodesRes.json();
  const edges: GraphEdge[] = await edgesRes.json();

  // Preserve order — Cosmograph onPointClick gives us an index into this array.
  const orderedNodes = nodes;

  // Scale betweenness_centrality to a visible point size range (5–20px)
  const bcValues = nodes.map((n) => n.betweenness_centrality);
  const bcMax = Math.max(...bcValues) || 1;
  const nodesForCosmograph = nodes.map(({ source_docs: _, ...rest }) => ({
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
    },
    links: {
      linkSourceBy: "source",
      linkTargetsBy: ["target"],
      linkWidthBy: "weight",
    },
  };

  const edgesForCosmograph = edges;

  const result = await prepareCosmographData(
    dataConfig,
    nodesForCosmograph as unknown as Record<string, unknown>[],
    edgesForCosmograph as unknown as Record<string, unknown>[],
  );
  if (!result) throw new Error("prepareCosmographData returned null");

  const { points, links, cosmographConfig } = result;

  return {
    orderedNodes,
    edges,
    cosmographConfig: {
      ...cosmographConfig,
      points,
      links,
      linkColorStrategy: "single",
      linkDefaultColor: "#ffffff",
    } as CosmographConfig,
  };
}
