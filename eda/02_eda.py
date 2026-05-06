"""
02_eda.py — Exploratory data analysis plots for the Epstein Files sample.

Reads eda/cache/sample.parquet and saves 4 PNG plots to eda/cache/plots/:
  1. docs_per_dataset.png   — document count per dataset_id
  2. file_type_dist.png     — file type distribution (post-filter: pdf-dominated)
  3. text_length_hist.png   — histogram of text_content character length
  4. top20_largest_docs.png — top 20 documents by text length (horizontal bar)

All plots use the dark theme defined in config.py (#0D1117 background, white text).

Usage:
    uv run python eda/02_eda.py
"""

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eda.config import (
    ACCENT,
    BG,
    FG,
    PLOTS_DIR,
    SAMPLE_PATH,
)


# ---------------------------------------------------------------------------
# Style helpers
# ---------------------------------------------------------------------------


def apply_dark_style() -> None:
    """Set global matplotlib rcParams for the dark theme."""
    plt.rcParams.update(
        {
            "figure.facecolor": BG,
            "axes.facecolor": BG,
            "axes.edgecolor": FG,
            "axes.labelcolor": FG,
            "axes.titlecolor": FG,
            "xtick.color": FG,
            "ytick.color": FG,
            "text.color": FG,
            "grid.color": "#21262D",
            "grid.linewidth": 0.5,
            "savefig.facecolor": BG,
            "savefig.edgecolor": BG,
            "font.size": 10,
            "axes.titlesize": 12,
            "axes.labelsize": 10,
        }
    )


def clean_spines(ax: plt.Axes, keep: tuple[str, ...] = ("bottom",)) -> None:
    """Remove most spines; keep only those in `keep`."""
    for spine in ("top", "right", "left", "bottom"):
        ax.spines[spine].set_visible(spine in keep)


def save_fig(fig: plt.Figure, path: Path) -> None:
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"   💾 Saved: {path.name}")


# ---------------------------------------------------------------------------
# Individual plot functions
# ---------------------------------------------------------------------------


def plot_docs_per_dataset(df: pl.DataFrame, out_dir: Path) -> None:
    """Bar chart: document count per dataset_id."""
    counts = (
        df.group_by("dataset_id")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )
    labels = counts["dataset_id"].to_list()
    values = counts["count"].to_list()

    fig, ax = plt.subplots(figsize=(max(8, len(labels) * 0.8), 5))
    bars = ax.bar(labels, values, color=ACCENT, edgecolor=BG, linewidth=0.5)
    ax.set_xlabel("Dataset ID")
    ax.set_ylabel("Document count")
    ax.set_title("Documents per Dataset (Sample)")
    ax.tick_params(axis="x", rotation=30)
    clean_spines(ax, keep=("bottom", "left"))

    for bar, val in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + max(values) * 0.01,
            f"{val:,}",
            ha="center",
            va="bottom",
            fontsize=8,
            color=FG,
        )

    plt.tight_layout()
    save_fig(fig, out_dir / "docs_per_dataset.png")


def plot_file_type_dist(df: pl.DataFrame, out_dir: Path) -> None:
    """Bar chart: file type distribution.

    Note: since 01_sample.py filters to file_type == 'pdf', this will show
    only PDFs in the sample. It is included anyway to document the filter
    outcome visually.
    """
    counts = (
        df.group_by("file_type")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )
    labels = counts["file_type"].to_list()
    values = counts["count"].to_list()

    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(labels, values, color=ACCENT, edgecolor=BG, linewidth=0.5)
    ax.set_xlabel("File type")
    ax.set_ylabel("Document count")
    ax.set_title("File Type Distribution (Sample — filtered to PDF)")
    clean_spines(ax, keep=("bottom", "left"))

    for bar, val in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + max(values) * 0.01,
            f"{val:,}",
            ha="center",
            va="bottom",
            fontsize=9,
            color=FG,
        )

    plt.tight_layout()
    save_fig(fig, out_dir / "file_type_dist.png")


def plot_text_length_hist(df: pl.DataFrame, out_dir: Path) -> None:
    """Histogram: distribution of text_content character length."""
    lengths = df.select(pl.col("text_content").str.len_chars().alias("len"))["len"].to_list()

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(lengths, bins=60, color=ACCENT, edgecolor=BG, linewidth=0.3)
    ax.set_xlabel("Text length (characters)")
    ax.set_ylabel("Number of documents")
    ax.set_title("Text Length Distribution")
    ax.set_yscale("log")  # log-scale because of heavy right tail
    ax.yaxis.grid(True)
    clean_spines(ax, keep=("bottom", "left"))

    plt.tight_layout()
    save_fig(fig, out_dir / "text_length_hist.png")


def plot_top20_largest_docs(df: pl.DataFrame, out_dir: Path) -> None:
    """Horizontal bar: top 20 documents by text length."""
    top = (
        df.select(
            pl.col("doc_id"),
            pl.col("file_name"),
            pl.col("text_content").str.len_chars().alias("len"),
        )
        .sort("len", descending=True)
        .head(20)
    )

    # Label: prefer file_name, fall back to doc_id
    labels = [
        (fn if fn and fn != "None" else did)
        for fn, did in zip(top["file_name"].to_list(), top["doc_id"].to_list())
    ]
    # Trim long names
    labels = [lbl[-40:] if len(lbl) > 40 else lbl for lbl in labels]
    values = top["len"].to_list()

    fig, ax = plt.subplots(figsize=(10, 7))
    bars = ax.barh(labels[::-1], values[::-1], color=ACCENT, edgecolor=BG, linewidth=0.3)
    ax.set_xlabel("Text length (characters)")
    ax.set_title("Top 20 Largest Documents by Text Length")
    clean_spines(ax, keep=("bottom",))
    ax.xaxis.grid(True)

    plt.tight_layout()
    save_fig(fig, out_dir / "top20_largest_docs.png")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    if not SAMPLE_PATH.exists():
        print(f"❌ Sample not found at {SAMPLE_PATH} — run 01_sample.py first.")
        sys.exit(1)

    print(f"📂 Loading sample from {SAMPLE_PATH} …")
    try:
        df = pl.read_parquet(SAMPLE_PATH)
    except Exception as exc:
        print(f"❌ Failed to read parquet: {exc}")
        sys.exit(1)

    print(f"✅ Loaded {len(df):,} rows, columns: {df.columns}")

    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    apply_dark_style()

    print("📊 Generating plots …")
    plot_docs_per_dataset(df, PLOTS_DIR)
    plot_file_type_dist(df, PLOTS_DIR)
    plot_text_length_hist(df, PLOTS_DIR)
    plot_top20_largest_docs(df, PLOTS_DIR)

    print(f"\n✅ All plots saved to {PLOTS_DIR}")


if __name__ == "__main__":
    main()
