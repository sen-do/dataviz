// Community colour palette — 18 well-separated hues for the curated graph's
// 11 Louvain communities. Enough distinct colours so no two visible communities share a hue.
export const COMMUNITY_COLORS: string[] = [
  "#58A6FF", // 0 — blue
  "#FF7B72", // 1 — coral red
  "#3FB950", // 2 — green
  "#D2A8FF", // 3 — lavender
  "#FFA657", // 4 — orange
  "#F0883E", // 5 — amber
  "#79C0FF", // 6 — sky blue
  "#FF6EB4", // 7 — hot pink
  "#56D364", // 8 — lime
  "#E3B341", // 9 — gold
  "#7EE7F1", // 10 — cyan
  "#BC8CFF", // 11 — violet
  "#FF9492", // 12 — soft pink
  "#39D353", // 13 — bright green
  "#FFC145", // 14 — yellow-orange
  "#C084FC", // 15 — purple
  "#22D3EE", // 16 — teal
  "#B1BAC4", // 17 — grey (fallback)
];

export function communityColor(community: number): string {
  return COMMUNITY_COLORS[community % COMMUNITY_COLORS.length] ?? "#B1BAC4";
}
