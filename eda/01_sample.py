"""
01_sample.py — Stream Epstein Files from HuggingFace and build a stratified sample.

Filters to file_type == "pdf" and non-empty text_content, then keeps the first
SAMPLE_SIZE qualifying documents per dataset_id (stratum).  Saves the result as
eda/cache/sample.parquet using Polars.

Usage:
    uv run python eda/01_sample.py

Environment:
    HF_TOKEN (optional) — HuggingFace token for authenticated access / higher rate limits.
    Set in .env; leave blank for anonymous streaming (works fine for this public dataset).
"""

import os
import sys
import time
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

# Ensure repo root is on sys.path so `from eda.config import ...` works when
# the script is run from the repo root (uv run python eda/01_sample.py).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eda.config import (
    CACHE_DIR,
    DATASET_NAME,
    HF_MAX_RETRIES,
    SAMPLE_PATH,
    SAMPLE_SIZE,
)

load_dotenv()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_dataset_with_backoff(dataset_name: str, token: str | None):
    """Load a HuggingFace streaming dataset with exponential backoff.

    Assumption: transient 429s and connection resets are the most common failures
    when streaming large datasets; 5 retries with doubling delays is sufficient.
    """
    from datasets import load_dataset

    for attempt in range(HF_MAX_RETRIES):
        try:
            ds = load_dataset(
                dataset_name,
                split="train",
                streaming=True,
                token=token,
            )
            return ds
        except Exception as exc:
            wait = 2**attempt
            if attempt < HF_MAX_RETRIES - 1:
                print(
                    f"⚠️  HuggingFace load error (attempt {attempt + 1}/{HF_MAX_RETRIES}): "
                    f"{exc}. Retrying in {wait}s…"
                )
                time.sleep(wait)
            else:
                print(f"❌ Failed to load dataset after {HF_MAX_RETRIES} attempts: {exc}")
                sys.exit(1)


def _is_valid(row: dict) -> bool:
    """Return True if the row qualifies for inclusion in the sample.

    Criteria:
    - file_type == "pdf"  (image-derived docs have much noisier OCR text)
    - text_content is a non-empty, non-whitespace string
    """
    if row.get("file_type") != "pdf":
        return False
    text = row.get("text_content")
    if not isinstance(text, str) or not text.strip():
        return False
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    token = os.environ.get("HF_TOKEN") or None
    if token:
        print("🔑 Using HuggingFace token from environment.")
    else:
        print("🌐 No HF_TOKEN found — streaming anonymously (public dataset).")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"📥 Loading dataset: {DATASET_NAME} (streaming) …")
    ds = _load_dataset_with_backoff(DATASET_NAME, token)

    # Stratified sampling state: {dataset_id: count_so_far}
    counts: dict[str, int] = {}
    records: list[dict] = []
    scanned = 0

    print(f"🔍 Scanning stream — target: {SAMPLE_SIZE} docs per dataset_id …")

    try:
        for row in ds:
            scanned += 1

            if not _is_valid(row):
                continue

            did = str(row.get("dataset_id", "unknown"))
            if counts.get(did, 0) >= SAMPLE_SIZE:
                continue  # this stratum is full

            records.append(
                {
                    "dataset_id": did,
                    "doc_id": str(row.get("doc_id", "")),
                    "file_name": str(row.get("file_name", "")),
                    "file_type": str(row.get("file_type", "")),
                    "online_url": str(row.get("online_url", "")),
                    "text_content": str(row.get("text_content", "")),
                    "metadata": str(row.get("metadata", "")),
                }
            )
            counts[did] = counts.get(did, 0) + 1

            if scanned % 10_000 == 0:
                filled = sum(1 for v in counts.values() if v >= SAMPLE_SIZE)
                print(
                    f"   … scanned {scanned:,} rows | "
                    f"{len(records):,} kept | "
                    f"{filled}/{len(counts)} strata full"
                )

            # Stop once all discovered strata are full.
            # Assumption: we don't know all dataset_ids upfront; we stop
            # only when all strata we've seen have reached SAMPLE_SIZE and
            # we've scanned at least 50,000 rows to surface rare strata.
            if (
                scanned >= 50_000
                and all(v >= SAMPLE_SIZE for v in counts.values())
            ):
                print(f"✅ All {len(counts)} strata full — stopping early.")
                break

    except KeyboardInterrupt:
        print("⚠️  Interrupted by user — saving partial sample.")

    # Report strata that didn't reach SAMPLE_SIZE (no silent truncation).
    for did, cnt in sorted(counts.items()):
        if cnt < SAMPLE_SIZE:
            print(
                f"⚠️  Stratum '{did}' has only {cnt} qualifying docs "
                f"(target was {SAMPLE_SIZE}) — using what's available."
            )

    if not records:
        print("❌ No records collected. Check dataset name and connectivity.")
        sys.exit(1)

    print(f"\n📦 Writing {len(records):,} rows to {SAMPLE_PATH} …")
    df = pl.DataFrame(records)
    df.write_parquet(SAMPLE_PATH)

    print(f"✅ Sample saved: {SAMPLE_PATH}")
    print(f"   Strata: {sorted(counts.keys())}")
    print(f"   Counts: {dict(sorted(counts.items()))}")
    print(f"   Total scanned: {scanned:,}")


if __name__ == "__main__":
    main()
