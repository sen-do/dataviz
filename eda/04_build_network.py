"""
04_build_network.py — Build the co-occurrence network and compute graph metrics.

Reads eda/cache/nodes.parquet + edges.parquet, constructs a NetworkX weighted
undirected graph, computes betweenness centrality, degree centrality, and
clustering coefficients, detects communities via Louvain, and exports:
  - eda/cache/nodes.json  (list of node dicts for the frontend)
  - eda/cache/edges.json  (list of edge dicts for the frontend)

Notes on performance and curation:
  Exact betweenness_centrality is O(VE) and can be slow for large graphs.
  If the graph has more than BETWEENNESS_K_THRESHOLD nodes, we use the
  k-sample approximation (k=500) and document this in the output.
  Assumption: k=500 gives adequate approximation for visualisation purposes;
  the exact value is not critical for a co-occurrence network.

  Two-graph strategy for presentation quality:
    1. Full cleaned graph  → used only for betweenness computation (global context).
    2. Curated subgraph    → top-CURATE_TOP_N nodes by betweenness, induced subgraph.
       On the subgraph, degree, clustering, and Louvain are recomputed — producing
       fewer, more distinct communities that map cleanly to the color palette.
       The full-graph betweenness values are kept for display so the "bridge" ranking
       remains meaningful (it reflects the whole network, not just the top slice).

Usage:
    uv run python eda/04_build_network.py
"""

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import networkx as nx
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eda.config import (
    ACCENT,
    BG,
    CACHE_DIR,
    COMMUNITY_COLORS,
    CURATE_TOP_N,
    EDGES_JSON,
    EDGES_PARQUET,
    FG,
    NODES_JSON,
    NODES_PARQUET,
    PLOTS_DIR,
)

# Switch to approximate betweenness when node count exceeds this threshold.
BETWEENNESS_K_THRESHOLD = 500
BETWEENNESS_K = 500

# Only label the top-N nodes by betweenness in the network plot (avoid clutter).
LABEL_TOP_N = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def apply_dark_style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": BG,
            "axes.facecolor": BG,
            "text.color": FG,
            "savefig.facecolor": BG,
            "savefig.edgecolor": BG,
        }
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    for path in (NODES_PARQUET, EDGES_PARQUET):
        if not path.exists():
            print(f"❌ Required file not found: {path} — run 03_extract_entities.py first.")
            sys.exit(1)

    print(f"📂 Loading nodes from {NODES_PARQUET} …", flush=True)
    nodes_df = pl.read_parquet(NODES_PARQUET)
    print(f"   {len(nodes_df):,} nodes", flush=True)

    print(f"📂 Loading edges from {EDGES_PARQUET} …", flush=True)
    edges_df = pl.read_parquet(EDGES_PARQUET)
    print(f"   {len(edges_df):,} edges", flush=True)

    # ---------------------------------------------------------------------------
    # Build NetworkX graph
    # ---------------------------------------------------------------------------
    print("🔨 Building NetworkX graph …", flush=True)
    G = nx.Graph()

    for row in nodes_df.iter_rows(named=True):
        G.add_node(
            row["id"],
            label=row["label"],
            type=row["type"],
            occurrences=row["occurrences"],
            dataset_ids=row["dataset_ids"],
            earliest_appearance=row.get("earliest_appearance"),
            wikidata_id=row.get("wikidata_id"),
            wikidata_label=row.get("wikidata_label"),
            wikidata_description=row.get("wikidata_description"),
        )

    for row in edges_df.iter_rows(named=True):
        G.add_edge(
            row["source"], row["target"],
            weight=row["weight"],
            relationship_type=row.get("relationship_type", "co_mentioned"),
            earliest_date=row.get("earliest_date"),
        )

    print(f"   Graph: {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges", flush=True)

    # Keep only the largest connected component for metrics and visualisation.
    # Assumption: isolated small components are typically noise from weak NER
    # matches that survived the edge filter.
    print("📐 Finding connected components …", flush=True)
    components = sorted(nx.connected_components(G), key=len, reverse=True)
    lcc = G.subgraph(components[0]).copy()
    print(
        f"   Largest connected component: {lcc.number_of_nodes():,} nodes, "
        f"{lcc.number_of_edges():,} edges",
        flush=True
    )
    if len(components) > 1:
        print(
            f"   ⚠️  Discarding {len(components) - 1} smaller component(s) "
            f"({G.number_of_nodes() - lcc.number_of_nodes():,} nodes total) "
            f"— these are kept in the exported JSON but omitted from metrics.",
            flush=True
        )

    # ---------------------------------------------------------------------------
    # Graph metrics
    # ---------------------------------------------------------------------------
    use_approx = lcc.number_of_nodes() > BETWEENNESS_K_THRESHOLD
    if use_approx:
        print(
            f"⚡ Graph has {lcc.number_of_nodes():,} nodes (> {BETWEENNESS_K_THRESHOLD}) — "
            f"using approximate betweenness (k={BETWEENNESS_K}).",
            flush=True
        )
    else:
        print("📐 Computing exact betweenness centrality …", flush=True)

    print("   ⏳ Betweenness centrality running …", flush=True)
    betweenness = nx.betweenness_centrality(
        lcc,
        weight="weight",
        normalized=True,
        **({"k": BETWEENNESS_K} if use_approx else {}),
    )
    print("   ✅ Betweenness done.", flush=True)

    print("📐 Computing degree centrality …", flush=True)
    degree_cent = nx.degree_centrality(lcc)
    print("   ✅ Degree centrality done.", flush=True)

    print("📐 Computing clustering coefficients …", flush=True)
    clustering = nx.clustering(lcc, weight="weight")
    print("   ✅ Clustering done.", flush=True)

    print("✅ All metrics computed.", flush=True)

    # ---------------------------------------------------------------------------
    # Curation — keep top-N nodes by betweenness, induce subgraph
    # ---------------------------------------------------------------------------
    print(f"✂️  Curating to top {CURATE_TOP_N} nodes by betweenness …", flush=True)
    top_nodes = sorted(betweenness, key=lambda n: betweenness[n], reverse=True)[:CURATE_TOP_N]
    top_node_set = set(top_nodes)
    curated = lcc.subgraph(top_node_set).copy()
    print(
        f"   Curated subgraph: {curated.number_of_nodes():,} nodes, "
        f"{curated.number_of_edges():,} edges",
        flush=True
    )

    # Recompute degree / clustering on the curated subgraph
    print("📐 Recomputing degree centrality on curated subgraph …", flush=True)
    degree_cent = nx.degree_centrality(curated)
    print("📐 Recomputing clustering on curated subgraph …", flush=True)
    clustering = nx.clustering(curated, weight="weight")

    # ---------------------------------------------------------------------------
    # Community detection (Louvain) — on curated subgraph
    # ---------------------------------------------------------------------------
    print("🏘️  Detecting communities (Louvain on curated subgraph) …", flush=True)
    community_sets = nx.community.louvain_communities(curated, weight="weight", seed=42)
    node_community: dict[str, int] = {}
    for community_idx, members in enumerate(community_sets):
        for node in members:
            node_community[node] = community_idx

    print(f"   Found {len(community_sets)} communities.", flush=True)

    # ---------------------------------------------------------------------------
    # Build export dicts — using curated node/edge set
    # ---------------------------------------------------------------------------
    print("📦 Building export dicts …", flush=True)
    approx_note = f"approximate (k={BETWEENNESS_K})" if use_approx else "exact"

    curated_node_ids = set(curated.nodes())

    node_export = []
    for row in nodes_df.iter_rows(named=True):
        nid = row["id"]
        if nid not in curated_node_ids:
            continue  # only export curated nodes
        node_export.append(
            {
                "id": nid,
                "label": row.get("wikidata_label") or row["label"],
                "type": row["type"],
                "degree": curated.degree(nid),  # degree in curated subgraph
                "occurrences": row["occurrences"],
                "dataset_ids": row["dataset_ids"],
                "betweenness_centrality": betweenness.get(nid, 0.0),
                "degree_centrality": degree_cent.get(nid, 0.0),
                "clustering": clustering.get(nid, 0.0),
                "community": node_community.get(nid, -1),
                "betweenness_method": approx_note,
                "wikidata_id": row.get("wikidata_id"),
                "wikidata_description": row.get("wikidata_description"),
            }
        )

    edge_export = []
    for row in edges_df.iter_rows(named=True):
        if row["source"] not in curated_node_ids or row["target"] not in curated_node_ids:
            continue  # only export edges within curated subgraph
        edge_export.append(
            {
                "source": row["source"],
                "target": row["target"],
                "weight": row["weight"],
                "doc_ids": row["doc_ids"],
            }
        )

    # ---------------------------------------------------------------------------
    # Write JSON files
    # ---------------------------------------------------------------------------
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    with NODES_JSON.open("w", encoding="utf-8") as f:
        json.dump(node_export, f, ensure_ascii=False, indent=2)
    print(f"✅ Nodes JSON: {NODES_JSON} ({len(node_export):,} nodes)", flush=True)

    with EDGES_JSON.open("w", encoding="utf-8") as f:
        json.dump(edge_export, f, ensure_ascii=False, indent=2)
    print(f"✅ Edges JSON: {EDGES_JSON} ({len(edge_export):,} edges)", flush=True)

    # ---------------------------------------------------------------------------
    # Network visualisation — SKIPPED for speed.
    # spring_layout on 52k nodes runs O(N²) ≈ 30-90 min on CPU.
    # The static plot can be regenerated later; frontend JSON is unaffected.
    # ---------------------------------------------------------------------------
    print("⏭️  Skipping network.png (spring_layout too slow).", flush=True)

    # ---------------------------------------------------------------------------
    # Summary statistics
    # ---------------------------------------------------------------------------
    print("\n📊 Network summary:", flush=True)
    print(f"   Full cleaned graph:  {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges", flush=True)
    print(f"   Curated subgraph:    {curated.number_of_nodes():,} nodes, {curated.number_of_edges():,} edges", flush=True)
    print(f"   Communities: {len(community_sets)}", flush=True)
    top5 = sorted(betweenness.items(), key=lambda x: x[1], reverse=True)[:5]
    print("   Top 5 by betweenness:", flush=True)
    for name, bc in top5:
        print(f"     {name:40s}  {bc:.4f}", flush=True)


if __name__ == "__main__":
    main()
