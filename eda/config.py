"""
Central configuration for the Epstein Files NER/network pipeline.
All pipeline scripts import from here — change values here to rerun at different scales.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

# Number of qualifying PDF documents to sample *per dataset_id* (stratum).
# Assumption: a stratified sample preserves coverage across sub-collections.
# Set lower (e.g. 100) for quick local tests; use 1000 for the full analysis.
SAMPLE_SIZE = 1000

# ---------------------------------------------------------------------------
# Entity / edge filtering thresholds
# ---------------------------------------------------------------------------

# Minimum number of documents an entity must appear in to be included.
# Entities below this are almost always OCR noise or irrelevant one-offs.
MIN_OCCURRENCES = 3

# Minimum co-occurrence weight (# shared documents) to keep an edge.
# Pairs appearing in only one document together are weak signals at this scale.
MIN_EDGE_WEIGHT = 2

# ---------------------------------------------------------------------------
# NLP
# ---------------------------------------------------------------------------

# spaCy model for NER. "en_core_web_sm" is fast and sufficient for PERSON/ORG.
# Install once: uv run python -m spacy download en_core_web_sm
SPACY_MODEL = "en_core_web_sm"

# Batch size for nlp.pipe — tune down if RAM is tight.
NLP_BATCH_SIZE = 64

# spaCy pipeline components to enable (disabling unused ones speeds up NER).
NLP_ENABLED = ["tok2vec", "ner"]

# ---------------------------------------------------------------------------
# HuggingFace
# ---------------------------------------------------------------------------

DATASET_NAME = "Nikity/Epstein-Files"

# Maximum retry attempts for exponential backoff on HF streaming errors.
HF_MAX_RETRIES = 5

# ---------------------------------------------------------------------------
# Paths — all relative to this file's parent (eda/)
# ---------------------------------------------------------------------------

EDA_DIR: Path = Path(__file__).resolve().parent
CACHE_DIR: Path = EDA_DIR / "cache"
PLOTS_DIR: Path = CACHE_DIR / "plots"

SAMPLE_PATH: Path = CACHE_DIR / "sample.parquet"
NODES_PARQUET: Path = CACHE_DIR / "nodes.parquet"
EDGES_PARQUET: Path = CACHE_DIR / "edges.parquet"
NODES_JSON: Path = CACHE_DIR / "nodes.json"
EDGES_JSON: Path = CACHE_DIR / "edges.json"

# ---------------------------------------------------------------------------
# Visual style (dark theme for all matplotlib outputs)
# ---------------------------------------------------------------------------

BG = "#0D1117"   # background
FG = "#FFFFFF"   # foreground (text, ticks, labels)
ACCENT = "#58A6FF"  # primary colour for bars / highlights

# Community colour palette (up to 12 communities; cycles if more).
COMMUNITY_COLORS = [
    "#58A6FF",  # blue
    "#3FB950",  # green
    "#FF7B72",  # red
    "#D2A8FF",  # purple
    "#FFA657",  # orange
    "#39D353",  # bright green
    "#F0883E",  # amber
    "#79C0FF",  # light blue
    "#56D364",  # lime
    "#FF9492",  # pink
    "#CFF4D2",  # mint
    "#B1BAC4",  # grey
]
