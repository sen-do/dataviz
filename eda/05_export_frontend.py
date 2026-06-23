"""
05_export_frontend.py — Export pipeline outputs as self-contained frontend data bundle.

Reads:
  eda/cache/nodes.json   (from 04_build_network.py)
  eda/cache/edges.json   (from 04_build_network.py)
  eda/cache/sample.parquet  (for doc_id → online_url, file_name)

Writes:
  frontend/public/data/nodes.json  — trimmed node list with per-node source_docs
  frontend/public/data/edges.json  — trimmed edge list (source, target, weight only)

Source-doc derivation:
  For each node, collect all doc_ids from its incident edges (edges where it appears
  as source or target), then join to online_url and file_name from sample.parquet.
  Assumption: this captures co-occurrence docs only, not solo-appearance docs.
  Cap at MAX_SOURCE_DOCS per node to keep JSON size manageable.

Usage:
    uv run python eda/05_export_frontend.py
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eda.config import (
    CACHE_DIR,
    EDGES_JSON,
    NODES_JSON,
    SAMPLE_PATH,
)

# Repository root → frontend data dir
REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DATA = REPO_ROOT / "frontend" / "public" / "data"

# Cap source docs per node to avoid bloating the JSON bundle.
MAX_SOURCE_DOCS = 15


def main() -> None:
    for path in (NODES_JSON, EDGES_JSON, SAMPLE_PATH):
        if not path.exists():
            print(f"❌ Required file not found: {path}", flush=True)
            print("   Run the full pipeline first: 01_sample.py → 04_build_network.py", flush=True)
            sys.exit(1)

    print(f"📂 Loading nodes from {NODES_JSON} …", flush=True)
    with NODES_JSON.open(encoding="utf-8") as f:
        nodes: list[dict] = json.load(f)

    print(f"📂 Loading edges from {EDGES_JSON} …", flush=True)
    with EDGES_JSON.open(encoding="utf-8") as f:
        edges: list[dict] = json.load(f)

    print(f"📂 Loading sample from {SAMPLE_PATH} …", flush=True)
    try:
        sample = pl.read_parquet(
            SAMPLE_PATH,
            columns=["doc_id", "online_url", "file_name"],
        )
    except Exception as exc:
        print(f"❌ Failed to read sample.parquet: {exc}", flush=True)
        sys.exit(1)

    # Build doc_id → {online_url, file_name} lookup
    doc_lookup: dict[str, dict] = {
        row["doc_id"]: {"online_url": row["online_url"] or "", "file_name": row["file_name"] or ""}
        for row in sample.iter_rows(named=True)
    }
    print(f"   {len(doc_lookup):,} docs in lookup.", flush=True)

    # Build node_id → set of doc_ids (from incident edges)
    # Assumption: only co-occurrence docs are captured; solo appearances not included.
    node_docs: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        for did in edge.get("doc_ids", []):
            node_docs[edge["source"]].add(did)
            node_docs[edge["target"]].add(did)

    # Assemble frontend node list
    frontend_nodes = []
    for node in nodes:
        nid = node["id"]
        doc_ids = sorted(node_docs.get(nid, set()))[:MAX_SOURCE_DOCS]
        source_docs = [
            {
                "doc_id": did,
                "file_name": doc_lookup.get(did, {}).get("file_name", ""),
                "online_url": doc_lookup.get(did, {}).get("online_url", ""),
            }
            for did in doc_ids
            if did in doc_lookup
        ]
        frontend_nodes.append(
            {
                "id": nid,
                "label": node.get("label", nid),
                "type": node.get("type", ""),
                "betweenness_centrality": node.get("betweenness_centrality", 0.0),
                "degree": node.get("degree", 0),
                "occurrences": node.get("occurrences", 0),
                "community": node.get("community", 0),
                "clustering_coefficient": node.get("clustering", 0.0),
                "source_docs": source_docs,
                "wikidata_id": node.get("wikidata_id"),
                "wikidata_description": node.get("wikidata_description"),
                # earliest_appearance omitted — column not populated in this run
            }
        )

    # Trimmed edge list — relationship_type/dates/snippets omitted (not populated in this run)
    frontend_edges = [
        {
            "source": e["source"],
            "target": e["target"],
            "weight": e["weight"],
        }
        for e in edges
    ]

    # Write outputs
    FRONTEND_DATA.mkdir(parents=True, exist_ok=True)

    nodes_out = FRONTEND_DATA / "nodes.json"
    with nodes_out.open("w", encoding="utf-8") as f:
        json.dump(frontend_nodes, f, ensure_ascii=False)
    print(f"✅ Wrote {nodes_out} ({len(frontend_nodes):,} nodes)", flush=True)

    edges_out = FRONTEND_DATA / "edges.json"
    with edges_out.open("w", encoding="utf-8") as f:
        json.dump(frontend_edges, f, ensure_ascii=False)
    print(f"✅ Wrote {edges_out} ({len(frontend_edges):,} edges)", flush=True)
    print("\n🎉 Run `cd frontend && npm run dev` to preview the app.", flush=True)


if __name__ == "__main__":
    main()
