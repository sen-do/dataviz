"""
03d_clean.py — Post-hoc noise cleaning and entity-alias merging.

Operates directly on the existing eda/cache/{nodes,edges}.parquet caches —
NO re-run of the expensive NER pipeline required.

Three-pass approach:
  1. Garbage filter   — drop OCR noise nodes via heuristics + stoplist.
  2. Alias merge      — merge fragmented entity variants (epstein/maxwell/etc.)
                        using a curated alias_map.
  3. Threshold filter — raise occurrences ≥ 3, weight ≥ 3 to cut weak signals.

Backs up the originals first to eda/cache/backups/.

Usage:
    uv run python eda/03d_clean.py

To iterate: run, inspect the printed top-100, add misses to STOPLIST or ALIAS_MAP,
re-run. Each run takes seconds.
"""

import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eda.config import EDGES_PARQUET, NODES_PARQUET

# ---------------------------------------------------------------------------
# Thresholds (applied after alias merging)
# ---------------------------------------------------------------------------
MIN_OCCURRENCES = 3
MIN_EDGE_WEIGHT = 3

# ---------------------------------------------------------------------------
# Garbage-detection heuristics
# ---------------------------------------------------------------------------
_GARBAGE_CHARS = frozenset("@<>")
_GARBAGE_SUBSTRINGS = (
    "http", "www.", ".com", ".org", ".net", ".edu", ".gov",
    ".corn",  # OCR of .com
    "gmail", "@",
    "inline-image", "doctype", "<!",
    "§",
)
_HEX_RE = re.compile(r"^[0-9a-f]{5,}$")
_DIGIT_RE = re.compile(r"\d")


def _is_garbage(label: str) -> bool:
    """Return True if the label looks like OCR noise / non-entity."""
    lo = label.lower().strip()

    # Very short — but allow real 2-letter orgs handled separately below
    if len(lo) <= 2:
        return True

    # Contains clear garbage characters
    if any(c in lo for c in _GARBAGE_CHARS):
        return True
    if any(sub in lo for sub in _GARBAGE_SUBSTRINGS):
        return True

    # Looks like a hex colour / hash
    if _HEX_RE.match(lo):
        return True

    # Digit-heavy (codes, page numbers, measurements, …)
    digit_count = len(_DIGIT_RE.findall(lo))
    if digit_count / max(len(lo), 1) > 0.4:
        return True

    return False


# ---------------------------------------------------------------------------
# Exact-match stoplist  (lowercased)
# Keep LEGIT acronyms OUT of this list: fbi, sec, doj, cia, nypd, at&t, doj …
# ---------------------------------------------------------------------------
STOPLIST: frozenset[str] = frozenset(
    {
        # Generic noise / OCR artifacts
        "llc", "na", "n/a", "n.a.", "ny", "je", "je.", "lsj",
        "doctype", "subject", "email", "ipad", "fri", "sat", "sun", "mon",
        "tue", "wed", "thu",
        "4th floor", "onscreen", "screening",
        "inline-images", "jpm", "amex",
        "screen size", "screen shot",
        "ma your customer",
        "confidential - pursuant to fed",
        "jee unauthorized",
        # Bare initials that aren't the canonical entity
        "jeffrey e", "jeffrey e.", "jeffrey e. <", "jeffrey e. subject",
        "j. epstein",
        # OCR-mangled partial labels
        "b7c", "na your customer", "09n4994105/1w1093",
        # Common OCR header fragments
        "from", "to", "cc", "bcc", "re", "fw", "fwd", "sent",
        "dear", "sincerely", "best regards", "regards",
        # Formatting artefacts
        "true", "false", "null", "undefined",
        "page", "pages", "exhibit",
        # Single generic terms that are never entities
        "company", "corporation", "corp", "inc", "ltd", "llp", "lp",
        "the company", "the firm",
        # Time / location fragments
        "am", "pm",
        # Very common OCR failures
        "jeevacation",
        # Discovered in top-50 after first pass — email header format strings
        "j. epstein sent",          # 205k occurrences, "From: J. Epstein Sent:" artifact
        "lesley groff sent",        # same pattern
        "lesley groff subject",     # same pattern
        "larry sent",
        # Other discovered noise
        "pdf",                      # file format label, not an entity
        "jee",                      # OCR artefact
        "fyi",                      # email abbreviation
        "do not reply",             # email boilerplate
        "exit information for travel",
        "the american express privacy statement",
        "google calendar",
        "utc",
        "adobe acrobat reader",
        "affiliates",
        "maxwell - request for review batches on relativity date: mon",
        "darren",                   # too ambiguous without full name
        "rich",                     # too ambiguous
        "bella",                    # ambiguous; bella klein handled via full name
        "jojo",                     # ambiguous OCR-common fragment
        "leon",                     # too ambiguous
        "natasha",                  # too ambiguous
        # Additional noise discovered in second pass
        "tues",                     # day abbreviation
        "your centurion travel service",  # boilerplate
        "intermediary disclosure",  # legal document artifact
        "david",                    # too ambiguous without surname
        "ann r",                    # partial name fragment
        "blackberry",               # device brand, not org in this context
        "iphone",                   # Apple device
        "richard kahn sent",        # email header artifact
        "boris nikolic subject",    # email header artifact
        "jee unauthoriz",           # partial OCR of "jee unauthorized"
        "4th floor new york",       # location noise
        "bank",                     # too generic
        "martin",                   # too ambiguous
        "paul",                     # too ambiguous
        "daphne",                   # ambiguous; daphne wallace has full name
        "madison",                  # too ambiguous (location or person)
        "court",                    # generic legal term
        # Found in second top-50 pass
        "intercept date",           # "The Intercept" + date OCR artifact
        "sent sun",                 # email header fragment
        "noti=",                    # OCR artifact
        "sent mon", "sent tue", "sent wed", "sent thu", "sent fri", "sent sat",
        "tom",                      # too ambiguous without surname
        "sarah",                    # too ambiguous
        "ann",                      # too ambiguous (ann rodriquez is already canonical)
        "richard",                  # too ambiguous (richard kahn is already canonical)
        "steve",                    # too ambiguous
        "john",                     # too ambiguous
        "nowak",                    # partial surname, too ambiguous
        "dela cruz",                # partial name
        "larry",                    # too ambiguous (larry visoski is canonical)
        # Round 3 additions
        "karyna shuliak sent",      # email header artifact
        "imap",                     # email protocol, not an entity
        "refer",                    # generic document term
        "chris",                    # too ambiguous
    }
)

# ---------------------------------------------------------------------------
# Alias map: alias_label (lowercased) → canonical_label (lowercased)
# The canonical must be a node that EXISTS after garbage filtering.
# ---------------------------------------------------------------------------
# fmt: off
ALIAS_MAP_LABELS: dict[str, str] = {
    # ── Jeffrey Epstein fragments ──────────────────────────────────────────
    "jeffrey":                 "jeffrey epstein",
    "jeff epstein":            "jeffrey epstein",
    "j. epstein":              "jeffrey epstein",
    "epstein":                 "jeffrey epstein",
    "j epstein":               "jeffrey epstein",
    # ── Ghislaine Maxwell fragments ────────────────────────────────────────
    "maxwell":                 "ghislaine maxwell",
    "g. maxwell":              "ghislaine maxwell",
    "ghislaine":               "ghislaine maxwell",
    "chislaine maxwell":       "ghislaine maxwell",   # common OCR
    "gislaine maxwell":        "ghislaine maxwell",
    # ── JPMorgan / Chase fragments ─────────────────────────────────────────
    "jpmorgan":                "jpmorgan chase",
    "jp morgan":               "jpmorgan chase",
    "chase":                   "jpmorgan chase",
    "jp morgan chase":         "jpmorgan chase",
    # ── Deutsche Bank ─────────────────────────────────────────────────────
    "db":                      "deutsche bank",
    "deutsche":                "deutsche bank",
    # ── Lesley Groff ──────────────────────────────────────────────────────
    "lesley":                  "lesley groff",
    # ── Richard Kahn ──────────────────────────────────────────────────────
    "rich kahn":               "richard kahn",
    "rick kahn":               "richard kahn",
    "r. kahn":                 "richard kahn",
    # ── Karyna Shuliak ────────────────────────────────────────────────────
    "karyna":                  "karyna shuliak",
    # ── Jeffrey Epstein (short informal forms) ────────────────────────────
    "jeff":                    "jeffrey epstein",
    # ── JPMorgan Chase variants ────────────────────────────────────────────
    "jpmorgan chase bank":     "jpmorgan chase",
    "j.p. morgan":             "jpmorgan chase",
    "j.p. morgan chase":       "jpmorgan chase",
    # ── American Express ──────────────────────────────────────────────────
    "american express centurion travel service":  "american express",
    "american express travel related services company, inc": "american express",
    "american express travel": "american express",
    # ── Common bank/financial short forms ─────────────────────────────────
    "fed":                     "federal reserve",
    # ── Deutsche Bank variants ────────────────────────────────────────────
    "deutsche bank ag":        "deutsche bank",
    "deutsche bank trust":     "deutsche bank",
    # ── Daphne Wallace ────────────────────────────────────────────────────
    "daphne":                  "daphne wallace",
    # ── Boris Nikolic ─────────────────────────────────────────────────────
    "boris":                   "boris nikolic",
    # ── Deutsche Bank Securities ──────────────────────────────────────────
    "deutsche bank securities inc": "deutsche bank",
    "deutsche bank securities": "deutsche bank",
    # ── Federal Reserve (fed already in map above) ────────────────────────
    "federal reserve bank":    "federal reserve",
    # ── Centurion Travel Service (AmEx subsidiary) ────────────────────────
    "centurion travel service": "american express",
    # ── Larry Visoski ─────────────────────────────────────────────────────
    # Leave "larry" alone — too ambiguous; larry visoski is already clean
}
# fmt: on

# ---------------------------------------------------------------------------
# Pattern-based alias rules: if label contains one of these substrings (whole
# word), map to the canonical — catches "billionaire epstein", "defendant epstein"
# ---------------------------------------------------------------------------
CONTAINS_RULES: list[tuple[re.Pattern, str]] = [
    # whole-word "epstein" but NOT "robert maxwell" or "kevin maxwell"
    (re.compile(r"\bepstein\b"), "jeffrey epstein"),
    # "jeffrey " prefix but not the canonical itself
    (re.compile(r"^jeffrey (?!epstein)"), "jeffrey epstein"),
    # maxwell variants, but exclude robert maxwell (real person) and kevin maxwell
    (re.compile(r"\bmaxwell\b(?!.*\b(?:robert|kevin|ian)\b)"), "ghislaine maxwell"),
]


def _canonical(label_lower: str, canonical_set: set[str]) -> str | None:
    """Return the canonical label for this label, or None if no rule applies."""
    # 1. Exact stoplist — already handled upstream; skip here
    # 2. Direct alias map
    if label_lower in ALIAS_MAP_LABELS:
        return ALIAS_MAP_LABELS[label_lower]
    # 3. Pattern rules
    for pattern, canonical in CONTAINS_RULES:
        if pattern.search(label_lower):
            if label_lower != canonical:
                return canonical
    return None


# ---------------------------------------------------------------------------
# Merge helper (reused from 03c logic)
# ---------------------------------------------------------------------------

def merge_by_alias(
    nodes_df: pl.DataFrame,
    edges_df: pl.DataFrame,
    alias_map: dict[str, str],  # node_id → canonical_node_id
) -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Merge alias nodes into their canonical.  Updates both nodes and edges.
    Returns the updated (nodes_df, edges_df).
    """
    if not alias_map:
        return nodes_df, edges_df

    print(f"🔀 Merging {len(alias_map)} alias nodes → canonicals …", flush=True)

    def resolve(nid: str) -> str:
        return alias_map.get(nid, nid)

    # Build a lookup of canonical_id → the label that belongs to the canonical node
    # (i.e. the node whose id IS the canonical_id, not an alias). This ensures the
    # canonical's label wins even if an alias has higher occurrences and gets processed first.
    canonical_label_for: dict[str, str] = {
        row["id"]: row.get("label") or row["id"]
        for row in nodes_df.iter_rows(named=True)
        if row["id"] not in alias_map  # only true canonical nodes
    }

    # Group nodes by canonical — sort by descending occurrences first so
    # aggregate stats accumulate correctly.
    canonical_rows: dict[str, dict] = {}
    sorted_rows = sorted(nodes_df.iter_rows(named=True), key=lambda r: -(r.get("occurrences") or 0))
    for row in sorted_rows:
        nid = row["id"]
        can_id = resolve(nid)
        if can_id not in canonical_rows:
            # Use the canonical node's true label, not the alias's label
            canonical_label = canonical_label_for.get(can_id, row.get("label") or can_id)
            canonical_rows[can_id] = {**row, "id": can_id, "label": canonical_label}
        else:
            c = canonical_rows[can_id]
            c["occurrences"] = c.get("occurrences", 0) + row.get("occurrences", 0)
            c["degree"] = c.get("degree", 0) + row.get("degree", 0)
            c["dataset_ids"] = sorted(
                set(c.get("dataset_ids") or []) | set(row.get("dataset_ids") or [])
            )
            # Keep earliest date
            dates = [d for d in [c.get("earliest_appearance"), row.get("earliest_appearance")] if d]
            c["earliest_appearance"] = min(dates) if dates else None

    merged_nodes = list(canonical_rows.values())

    # Rewrite edges
    merged_edges: dict[tuple[str, str], dict] = {}
    for row in edges_df.iter_rows(named=True):
        src = resolve(row["source"])
        tgt = resolve(row["target"])
        if src == tgt:
            continue  # self-loop after merge → discard
        pair = (min(src, tgt), max(src, tgt))
        if pair not in merged_edges:
            merged_edges[pair] = {**row, "source": pair[0], "target": pair[1]}
        else:
            ex = merged_edges[pair]
            ex["weight"] = ex.get("weight", 0) + row.get("weight", 0)
            ex["doc_ids"] = list(set(ex.get("doc_ids") or []) | set(row.get("doc_ids") or []))
            snippets = (ex.get("sentence_snippets") or []) + (row.get("sentence_snippets") or [])
            ex["sentence_snippets"] = snippets[:3]
            dates = [d for d in [ex.get("earliest_date"), row.get("earliest_date")] if d]
            ex["earliest_date"] = min(dates) if dates else None

    new_nodes_df = pl.DataFrame(merged_nodes, infer_schema_length=None, schema_overrides={
        "wikidata_id": pl.String,
        "wikidata_label": pl.String,
        "wikidata_description": pl.String,
        "earliest_appearance": pl.String,
    })
    new_edges_df = pl.DataFrame(
        list(merged_edges.values()), infer_schema_length=None, schema_overrides={
            "earliest_date": pl.String,
        }
    )
    return new_nodes_df, new_edges_df


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    for path in (NODES_PARQUET, EDGES_PARQUET):
        if not path.exists():
            print(f"❌ Not found: {path} — run prior pipeline steps first.")
            sys.exit(1)

    # ── backup ──────────────────────────────────────────────────────────────
    backup_dir = NODES_PARQUET.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(NODES_PARQUET, backup_dir / f"nodes_pre_clean_{ts}.parquet")
    shutil.copy2(EDGES_PARQUET, backup_dir / f"edges_pre_clean_{ts}.parquet")
    print(f"💾 Backed up originals to {backup_dir}", flush=True)

    # ── load ────────────────────────────────────────────────────────────────
    print(f"📂 Loading nodes from {NODES_PARQUET} …", flush=True)
    nodes_df = pl.read_parquet(NODES_PARQUET)
    print(f"   {len(nodes_df):,} nodes", flush=True)
    print(f"📂 Loading edges from {EDGES_PARQUET} …", flush=True)
    edges_df = pl.read_parquet(EDGES_PARQUET)
    print(f"   {len(edges_df):,} edges", flush=True)

    # ── PASS 1: garbage filter ───────────────────────────────────────────────
    print("\n🧹 Pass 1: garbage filter …", flush=True)
    keep_mask = []
    dropped_labels = []
    for row in nodes_df.iter_rows(named=True):
        lo = (row["label"] or "").lower().strip()
        if lo in STOPLIST or _is_garbage(lo):
            keep_mask.append(False)
            dropped_labels.append(row["label"])
        else:
            keep_mask.append(True)
    nodes_df = nodes_df.filter(pl.Series(keep_mask))
    # drop edges touching removed nodes
    surviving_ids = set(nodes_df["id"].to_list())
    edges_df = edges_df.filter(
        pl.col("source").is_in(surviving_ids) & pl.col("target").is_in(surviving_ids)
    )
    print(f"   Dropped {len(dropped_labels):,} garbage nodes.", flush=True)
    print(f"   Remaining: {len(nodes_df):,} nodes, {len(edges_df):,} edges", flush=True)

    # ── PASS 2: alias merge ──────────────────────────────────────────────────
    print("\n🔀 Pass 2: alias merge …", flush=True)

    # Build id → label map for the surviving nodes
    id_to_label: dict[str, str] = {
        row["id"]: (row["label"] or "").lower().strip()
        for row in nodes_df.iter_rows(named=True)
    }
    # Build label → id map (first occurrence wins, prefer higher occurrence)
    label_to_id: dict[str, str] = {}
    for row in sorted(nodes_df.iter_rows(named=True), key=lambda r: -(r.get("occurrences") or 0)):
        lo = (row["label"] or "").lower().strip()
        if lo not in label_to_id:
            label_to_id[lo] = row["id"]

    canonical_label_set = set(id_to_label.values())

    # Build alias_map: node_id → canonical_node_id
    alias_map: dict[str, str] = {}
    alias_report: list[tuple[str, str, str]] = []

    for nid, lo in id_to_label.items():
        can_lo = _canonical(lo, canonical_label_set)
        if can_lo is None:
            continue
        can_id = label_to_id.get(can_lo)
        if can_id is None:
            # canonical not found as a separate node — use this node itself
            # (e.g. canonical IS the surviving node with the right label)
            continue
        if can_id == nid:
            continue  # already canonical
        alias_map[nid] = can_id
        alias_report.append((id_to_label[nid], can_lo, nid))

    if alias_report:
        print(f"   {len(alias_report)} alias → canonical mappings:", flush=True)
        for orig_lo, can_lo, _ in sorted(alias_report)[:40]:
            print(f"     {orig_lo!r:40s} → {can_lo!r}", flush=True)
        if len(alias_report) > 40:
            print(f"     … and {len(alias_report) - 40} more", flush=True)

    nodes_df, edges_df = merge_by_alias(nodes_df, edges_df, alias_map)
    print(f"   After merge: {len(nodes_df):,} nodes, {len(edges_df):,} edges", flush=True)

    # ── PASS 3: threshold filter ─────────────────────────────────────────────
    print(f"\n✂️  Pass 3: thresholds (occurrences ≥ {MIN_OCCURRENCES}, weight ≥ {MIN_EDGE_WEIGHT}) …",
          flush=True)
    nodes_df = nodes_df.filter(pl.col("occurrences") >= MIN_OCCURRENCES)
    surviving_ids = set(nodes_df["id"].to_list())
    edges_df = edges_df.filter(
        (pl.col("weight") >= MIN_EDGE_WEIGHT)
        & pl.col("source").is_in(surviving_ids)
        & pl.col("target").is_in(surviving_ids)
    )
    # Drop degree-0 nodes (no surviving edges)
    nodes_with_edges = (
        set(edges_df["source"].to_list()) | set(edges_df["target"].to_list())
    )
    nodes_df = nodes_df.filter(pl.col("id").is_in(nodes_with_edges))
    print(f"   After thresholds: {len(nodes_df):,} nodes, {len(edges_df):,} edges", flush=True)

    # ── write ───────────────────────────────────────────────────────────────
    nodes_df.write_parquet(NODES_PARQUET)
    edges_df.write_parquet(EDGES_PARQUET)
    print(f"\n✅ Wrote cleaned parquets to {NODES_PARQUET.parent}", flush=True)

    # ── report top-100 for iteration ─────────────────────────────────────────
    print("\n📊 Top 50 nodes by occurrences (for human review — add noise to STOPLIST):", flush=True)
    top50 = nodes_df.sort("occurrences", descending=True).head(50)
    for row in top50.iter_rows(named=True):
        print(f"   occ={row['occurrences']:5d}  deg={row.get('degree', 0):5d}  {row['label']!r}", flush=True)


if __name__ == "__main__":
    main()
