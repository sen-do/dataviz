import { prepareCosmographData } from "@cosmograph/react";
import type { CosmographConfig } from "@cosmograph/react";
import type { GraphNode, GraphEdge } from "@/types";
import { COMMUNITY_COLORS } from "@/lib/colors";

export interface PreparedGraph {
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

  const orderedNodes = nodes;

  // Scale betweenness to visible size range (5–20px)
  const bcMax = Math.max(...nodes.map((n) => n.betweenness_centrality)) || 1;
  const nodesForCosmograph = nodes.map(({ source_docs: _, wikidata_description: __, ...rest }) => ({
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

  const result = await prepareCosmographData(
    dataConfig,
    nodesForCosmograph as unknown as Record<string, unknown>[],
    edges as unknown as Record<string, unknown>[],
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
    } as CosmographConfig,
  };
}
