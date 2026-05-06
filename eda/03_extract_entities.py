"""
03_extract_entities.py — NER-based entity extraction and co-occurrence graph construction.

Reads eda/cache/sample.parquet, runs spaCy NER (PERSON + ORG only), normalises
entity strings, filters by MIN_OCCURRENCES, builds a co-occurrence edge list
filtered by MIN_EDGE_WEIGHT, and writes:
  - eda/cache/nodes.parquet  (id, label, type, degree, occurrences, dataset_ids)
  - eda/cache/edges.parquet  (source, target, weight, doc_ids)

Limitations (documented here and in docs/data_report.qmd):
  - 'en_core_web_sm' is a small model optimised for speed; its NER precision on
    noisy OCR text is limited. Entity resolution (same person, different spellings)
    is NOT performed — this is the main methodological limitation of this pipeline.
  - Normalisation only does basic cleaning (lowercase, strip, punctuation trim);
    alias mapping (e.g. "epstein" == "jeffrey epstein") is out of scope for v1.
  - Co-occurrence is document-level, not sentence-level, which over-estimates
    connection strength for very long documents.

Usage:
    uv run python eda/03_extract_entities.py
"""

import json
import re
import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import polars as pl
import spacy

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eda.config import (
    CACHE_DIR,
    EDGES_PARQUET,
    MIN_EDGE_WEIGHT,
    MIN_OCCURRENCES,
    NODES_PARQUET,
    NLP_BATCH_SIZE,
    NLP_ENABLED,
    SAMPLE_PATH,
    SPACY_MODEL,
)

# Regex to strip leading/trailing punctuation artifacts common in OCR output.
_PUNCT_STRIP = re.compile(r"^[.,;:'\"\-\(\)\[\]]+|[.,;:'\"\-\(\)\[\]]+$")


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------


def normalise(text: str) -> str:
    """Normalise an entity mention to a canonical key.

    Steps:
      1. Lowercase
      2. Strip leading/trailing whitespace
      3. Collapse internal whitespace to single spaces
      4. Strip leading/trailing punctuation artifacts (OCR noise)

    Returns an empty string if the result is fewer than 2 characters
    (single chars are almost always noise).
    """
    s = text.lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = _PUNCT_STRIP.sub("", s).strip()
    return s if len(s) >= 2 else ""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    if not SAMPLE_PATH.exists():
        print(f"❌ Sample not found: {SAMPLE_PATH} — run 01_sample.py first.")
        sys.exit(1)

    print(f"📂 Loading sample from {SAMPLE_PATH} …")
    try:
        df = pl.read_parquet(SAMPLE_PATH)
    except Exception as exc:
        print(f"❌ Failed to read parquet: {exc}")
        sys.exit(1)

    print(f"✅ Loaded {len(df):,} rows.")

    # Build (doc_id, dataset_id, text) tuples for NLP processing.
    texts = df.select(["doc_id", "dataset_id", "text_content"]).to_dicts()

    print(f"🧠 Loading spaCy model '{SPACY_MODEL}' …")
    try:
        nlp = spacy.load(SPACY_MODEL, enable=NLP_ENABLED)
    except OSError:
        print(
            f"❌ spaCy model '{SPACY_MODEL}' not found. "
            f"Run: uv run python -m spacy download {SPACY_MODEL}"
        )
        sys.exit(1)

    # Disable components not needed for NER to speed up processing.
    # Assumption: tok2vec + ner is sufficient; parser/lemmatizer are skipped.
    print(
        f"🔍 Running NER on {len(texts):,} documents "
        f"(batch_size={NLP_BATCH_SIZE}) …"
    )

    # entity_docs[normalised_label] = set of doc_ids containing that entity
    entity_docs: dict[str, set[str]] = defaultdict(set)
    # entity_type[normalised_label] = "PERSON" | "ORG"
    entity_type: dict[str, str] = {}
    # entity_datasets[normalised_label] = set of dataset_ids
    entity_datasets: dict[str, set[str]] = defaultdict(set)
    # doc_entities[doc_id] = set of normalised entity labels in that doc
    doc_entities: dict[str, set[str]] = defaultdict(set)

    raw_texts = [row["text_content"] for row in texts]
    doc_ids = [row["doc_id"] for row in texts]
    dataset_ids = [row["dataset_id"] for row in texts]

    processed = 0
    for doc, doc_id, dataset_id in zip(
        nlp.pipe(raw_texts, batch_size=NLP_BATCH_SIZE), doc_ids, dataset_ids
    ):
        processed += 1
        if processed % 500 == 0:
            print(f"   … processed {processed:,}/{len(texts):,} docs")

        seen_in_doc: set[str] = set()
        for ent in doc.ents:
            if ent.label_ not in ("PERSON", "ORG"):
                continue
            key = normalise(ent.text)
            if not key:
                continue
            seen_in_doc.add(key)
            # Only record the label type on first encounter.
            if key not in entity_type:
                entity_type[key] = ent.label_

        for key in seen_in_doc:
            entity_docs[key].add(doc_id)
            entity_datasets[key].add(dataset_id)
            doc_entities[doc_id].add(key)

    print(f"✅ NER complete — {len(entity_type):,} unique normalised entities found.")

    # ---------------------------------------------------------------------------
    # Filter entities by MIN_OCCURRENCES
    # ---------------------------------------------------------------------------
    valid_entities = {
        key
        for key, docs in entity_docs.items()
        if len(docs) >= MIN_OCCURRENCES
    }
    print(
        f"🔧 After MIN_OCCURRENCES={MIN_OCCURRENCES} filter: "
        f"{len(valid_entities):,} entities retained."
    )

    # ---------------------------------------------------------------------------
    # Build co-occurrence edges
    # ---------------------------------------------------------------------------
    # co_edge[(a, b)] = list of doc_ids where both a and b appear
    co_edge: dict[tuple[str, str], list[str]] = defaultdict(list)

    for doc_id, ents in doc_entities.items():
        # Only keep valid entities for this doc
        valid_in_doc = ents & valid_entities
        for a, b in combinations(sorted(valid_in_doc), 2):
            co_edge[(a, b)].append(doc_id)

    print(f"🔗 Raw co-occurrence pairs: {len(co_edge):,}")

    # Filter by MIN_EDGE_WEIGHT
    strong_edges = {
        (a, b): doc_list
        for (a, b), doc_list in co_edge.items()
        if len(doc_list) >= MIN_EDGE_WEIGHT
    }
    print(
        f"🔧 After MIN_EDGE_WEIGHT={MIN_EDGE_WEIGHT} filter: "
        f"{len(strong_edges):,} edges retained."
    )

    # ---------------------------------------------------------------------------
    # Compute degree (from surviving edges) and build node list
    # ---------------------------------------------------------------------------
    node_degree: dict[str, int] = defaultdict(int)
    for a, b in strong_edges:
        node_degree[a] += 1
        node_degree[b] += 1

    # Only include nodes that participate in at least one surviving edge.
    active_nodes = set(node_degree.keys())
    print(f"📍 Nodes with edges: {len(active_nodes):,}")

    node_records = [
        {
            "id": key,
            "label": key,
            "type": entity_type.get(key, "UNKNOWN"),
            "degree": node_degree[key],
            "occurrences": len(entity_docs[key]),
            "dataset_ids": sorted(entity_datasets[key]),
        }
        for key in active_nodes
    ]

    edge_records = [
        {
            "source": a,
            "target": b,
            "weight": len(doc_list),
            "doc_ids": doc_list,
        }
        for (a, b), doc_list in strong_edges.items()
    ]

    # ---------------------------------------------------------------------------
    # Write outputs
    # ---------------------------------------------------------------------------
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    nodes_df = pl.DataFrame(node_records)
    nodes_df.write_parquet(NODES_PARQUET)
    print(f"✅ Nodes written: {NODES_PARQUET} ({len(node_records):,} rows)")

    edges_df = pl.DataFrame(edge_records)
    edges_df.write_parquet(EDGES_PARQUET)
    print(f"✅ Edges written: {EDGES_PARQUET} ({len(edge_records):,} rows)")


if __name__ == "__main__":
    main()
