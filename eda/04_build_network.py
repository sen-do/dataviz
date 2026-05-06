"""
04_build_network.py — Build the co-occurrence network and compute graph metrics.

Reads eda/cache/nodes.parquet + edges.parquet, constructs a NetworkX weighted
undirected graph, computes betweenness centrality, degree centrality, and
clustering coefficients, detects communities via Louvain, and exports:
  - eda/cache/nodes.json  (list of node dicts for the frontend)
  - eda/cache/edges.json  (list of edge dicts for the frontend)
  - eda/cache/plots/network.png  (static network visualisation)

Notes on performance:
  Exact betweenness_centrality is O(VE) and can be slow for large graphs.
  If the graph has more than BETWEENNESS_K_THRESHOLD nodes, we use the
  k-sample approximation (k=500) and document this in the output.
  Assumption: k=500 gives adequate approximation for visualisation purposes;
  the exact value is not critical for a co-occurrence network.

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

    print(f"📂 Loading nodes from {NODES_PARQUET} …")
    nodes_df = pl.read_parquet(NODES_PARQUET)
    print(f"   {len(nodes_df):,} nodes")

    print(f"📂 Loading edges from {EDGES_PARQUET} …")
    edges_df = pl.read_parquet(EDGES_PARQUET)
    print(f"   {len(edges_df):,} edges")

    # ---------------------------------------------------------------------------
    # Build NetworkX graph
    # ---------------------------------------------------------------------------
    print("🔨 Building NetworkX graph …")
    G = nx.Graph()

    for row in nodes_df.iter_rows(named=True):
        G.add_node(
            row["id"],
            label=row["label"],
            type=row["type"],
            occurrences=row["occurrences"],
            dataset_ids=row["dataset_ids"],
        )

    for row in edges_df.iter_rows(named=True):
        G.add_edge(row["source"], row["target"], weight=row["weight"])

    print(f"   Graph: {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges")

    # Keep only the largest connected component for metrics and visualisation.
    # Assumption: isolated small components are typically noise from weak NER
    # matches that survived the edge filter.
    components = sorted(nx.connected_components(G), key=len, reverse=True)
    lcc = G.subgraph(components[0]).copy()
    print(
        f"   Largest connected component: {lcc.number_of_nodes():,} nodes, "
        f"{lcc.number_of_edges():,} edges"
    )
    if len(components) > 1:
        print(
            f"   ⚠️  Discarding {len(components) - 1} smaller component(s) "
            f"({G.number_of_nodes() - lcc.number_of_nodes():,} nodes total) "
            f"— these are kept in the exported JSON but omitted from metrics."
        )

    # ---------------------------------------------------------------------------
    # Graph metrics
    # ---------------------------------------------------------------------------
    use_approx = lcc.number_of_nodes() > BETWEENNESS_K_THRESHOLD
    if use_approx:
        print(
            f"⚡ Graph has {lcc.number_of_nodes():,} nodes (> {BETWEENNESS_K_THRESHOLD}) — "
            f"using approximate betweenness (k={BETWEENNESS_K})."
        )
    else:
        print("📐 Computing exact betweenness centrality …")

    betweenness = nx.betweenness_centrality(
        lcc,
        weight="weight",
        normalized=True,
        **({"k": BETWEENNESS_K} if use_approx else {}),
    )
    degree_cent = nx.degree_centrality(lcc)
    clustering = nx.clustering(lcc, weight="weight")

    print("✅ Metrics computed.")

    # ---------------------------------------------------------------------------
    # Community detection (Louvain)
    # ---------------------------------------------------------------------------
    print("🏘️  Detecting communities (Louvain) …")
    community_sets = nx.community.louvain_communities(lcc, weight="weight", seed=42)
    node_community: dict[str, int] = {}
    for community_idx, members in enumerate(community_sets):
        for node in members:
            node_community[node] = community_idx

    # Assign community 0 to any node not in the LCC.
    print(f"   Found {len(community_sets)} communities.")

    # ---------------------------------------------------------------------------
    # Build export dicts
    # ---------------------------------------------------------------------------
    approx_note = f"approximate (k={BETWEENNESS_K})" if use_approx else "exact"

    node_export = []
    for row in nodes_df.iter_rows(named=True):
        nid = row["id"]
        node_export.append(
            {
                "id": nid,
                "label": row["label"],
                "type": row["type"],
                "degree": row["degree"],
                "occurrences": row["occurrences"],
                "dataset_ids": row["dataset_ids"],
                "betweenness_centrality": betweenness.get(nid, 0.0),
                "degree_centrality": degree_cent.get(nid, 0.0),
                "clustering": clustering.get(nid, 0.0),
                "community": node_community.get(nid, -1),
                "betweenness_method": approx_note,
            }
        )

    edge_export = []
    for row in edges_df.iter_rows(named=True):
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
    print(f"✅ Nodes JSON: {NODES_JSON} ({len(node_export):,} nodes)")

    with EDGES_JSON.open("w", encoding="utf-8") as f:
        json.dump(edge_export, f, ensure_ascii=False, indent=2)
    print(f"✅ Edges JSON: {EDGES_JSON} ({len(edge_export):,} edges)")

    # ---------------------------------------------------------------------------
    # Network visualisation
    # ---------------------------------------------------------------------------
    print("🎨 Rendering network visualisation …")
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    apply_dark_style()

    # Use the LCC for the plot.
    fig, ax = plt.subplots(figsize=(18, 14))
    ax.set_facecolor(BG)
    ax.axis("off")

    # Layout — spring layout with weight for better cluster separation.
    pos = nx.spring_layout(lcc, weight="weight", k=0.4, seed=42)

    # Node sizes proportional to betweenness (scale for visual clarity).
    max_bc = max(betweenness.values()) if betweenness else 1.0
    node_sizes = [
        max(30, (betweenness.get(n, 0.0) / max_bc) * 1200 + 20)
        for n in lcc.nodes()
    ]

    # Node colours by community.
    num_colors = len(COMMUNITY_COLORS)
    node_colors = [
        COMMUNITY_COLORS[node_community.get(n, 0) % num_colors]
        for n in lcc.nodes()
    ]

    # Edge widths proportional to weight.
    max_weight = max((d["weight"] for _, _, d in lcc.edges(data=True)), default=1)
    edge_widths = [
        0.3 + (d["weight"] / max_weight) * 2.0
        for _, _, d in lcc.edges(data=True)
    ]

    nx.draw_networkx_edges(
        lcc,
        pos,
        ax=ax,
        width=edge_widths,
        edge_color="#30363D",
        alpha=0.7,
    )
    nx.draw_networkx_nodes(
        lcc,
        pos,
        ax=ax,
        node_size=node_sizes,
        node_color=node_colors,
        alpha=0.9,
        linewidths=0.3,
        edgecolors=BG,
    )

    # Label only top-N nodes by betweenness to avoid clutter.
    top_nodes = sorted(betweenness, key=betweenness.get, reverse=True)[:LABEL_TOP_N]
    top_labels = {n: lcc.nodes[n].get("label", n) for n in top_nodes if n in lcc}
    nx.draw_networkx_labels(
        lcc,
        pos,
        labels=top_labels,
        ax=ax,
        font_size=6,
        font_color=FG,
        bbox={"boxstyle": "round,pad=0.2", "facecolor": BG, "alpha": 0.5, "edgecolor": "none"},
    )

    ax.set_title(
        f"Epstein Files — Co-occurrence Network\n"
        f"Node size: betweenness centrality ({approx_note})  |  "
        f"Colour: community (Louvain)  |  "
        f"Labels: top {LABEL_TOP_N} by betweenness",
        color=FG,
        fontsize=11,
        pad=12,
    )

    network_png = PLOTS_DIR / "network.png"
    fig.savefig(network_png, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"✅ Network plot saved: {network_png}")

    # ---------------------------------------------------------------------------
    # Summary statistics
    # ---------------------------------------------------------------------------
    print("\n📊 Network summary:")
    print(f"   Nodes:      {G.number_of_nodes():,}")
    print(f"   Edges:      {G.number_of_edges():,}")
    print(f"   Communities: {len(community_sets)}")
    top5 = sorted(betweenness.items(), key=lambda x: x[1], reverse=True)[:5]
    print("   Top 5 by betweenness:")
    for name, bc in top5:
        print(f"     {name:40s}  {bc:.4f}")


if __name__ == "__main__":
    main()
