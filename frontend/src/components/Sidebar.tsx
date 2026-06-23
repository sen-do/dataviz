import { useMemo, useState } from "react";
import { useGraphStore, useSelectedNode } from "@/store";
import { cosmographRef } from "@/graphRef";
import { communityColor } from "@/lib/colors";

// Human-readable community names derived from top-betweenness nodes per cluster
const COMMUNITY_NAMES: Record<number, string> = {
  0:  "JPMorgan & SEC",
  1:  "Island & Aviation",
  2:  "Deutsche Bank",
  3:  "Logistics",
  4:  "Epstein Core",
  5:  "Personal Staff",
  6:  "Investment Funds",
  7:  "Inner Circle",
  8:  "Academic",
  9:  "Government",
  10: "Maxwell & Legal",
};
import { Switch } from "@/components/ui/switch";
import type { GraphNode } from "@/types";

const MAX_SEARCH_RESULTS = 8;

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

/* ─── Root ───────────────────────────────────────────────────────────────── */

export function Sidebar() {
  const nodes = useGraphStore((s) => s.nodes);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const selectedNode = useSelectedNode();

  const [trail, setTrail] = useState<string[]>([]);

  // When node changes via external means (e.g. graph click), reset trail
  // but we handle trail push internally in selectNode.

  function handleSelectNode(id: string | null) {
    if (id === null) {
      setTrail([]);
      setSelectedNode(null);
    } else {
      setSelectedNode(id);
    }
  }

  function handleBreadcrumbJump(id: string, idx: number) {
    // Jump back to node at idx, trim trail to that point
    setTrail((prev) => prev.slice(0, idx));
    setSelectedNode(id);
    const nodeIdx = nodes.findIndex((n) => n.id === id);
    if (nodeIdx >= 0) cosmographRef.current?.focusPoint(nodeIdx);
  }

  function handleNeighborClick(id: string) {
    const currentId = selectedNode?.id;
    if (currentId) {
      setTrail((prev) => [...prev, currentId]);
    }
    setSelectedNode(id);
    const nodeIdx = nodes.findIndex((n) => n.id === id);
    if (nodeIdx >= 0) cosmographRef.current?.focusPoint(nodeIdx);
  }

  function handleBack() {
    const prev = trail[trail.length - 1];
    if (prev) {
      setTrail((t) => t.slice(0, -1));
      setSelectedNode(prev);
      const nodeIdx = nodes.findIndex((n) => n.id === prev);
      if (nodeIdx >= 0) cosmographRef.current?.focusPoint(nodeIdx);
    } else {
      setTrail([]);
      setSelectedNode(null);
    }
  }

  return (
    <aside
      style={{
        position: "fixed",
        left: 20,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 20,
        width: 320,
        maxHeight: "calc(100vh - 80px)",
        background: "#09090b",
        border: "1px solid #27272a",
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {selectedNode ? (
        <NodeDetail
          node={selectedNode}
          trail={trail}
          setSelectedNode={handleSelectNode}
          onBack={handleBack}
          onBreadcrumbJump={handleBreadcrumbJump}
          onNeighborClick={handleNeighborClick}
        />
      ) : (
        <DefaultView setTrail={setTrail} />
      )}
    </aside>
  );
}

/* ─── State 1: Default ─────────────────────────────────────────────────── */

interface DefaultViewProps {
  setTrail: React.Dispatch<React.SetStateAction<string[]>>;
}

function DefaultView({ setTrail }: DefaultViewProps) {
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const allCommunities = useGraphStore((s) => s.allCommunities);
  const activeCommunities = useGraphStore((s) => s.activeCommunities);
  const toggleCommunity = useGraphStore((s) => s.toggleCommunity);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const minConn = useGraphStore((s) => s.minConnections);
  const setMinConn = useGraphStore((s) => s.setMinConnections);

  // Filter nodes/edges by active communities
  const { nodes, edges } = useMemo(() => {
    const filteredNodes = allNodes.filter((n) => activeCommunities.has(n.community));
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = allEdges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [allNodes, allEdges, activeCommunities]);

  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const maxDegree = useMemo(
    () => nodes.reduce((m, n) => Math.max(m, n.degree), 1),
    [nodes]
  );

  const density = useMemo(() => {
    const n = nodes.length;
    if (n < 2) return 0;
    return (2 * edges.length) / (n * (n - 1));
  }, [nodes, edges]);

  const top5 = useMemo(
    () =>
      [...nodes]
        .filter((n) => n.degree >= minConn)
        .sort((a, b) => b.betweenness_centrality - a.betweenness_centrality)
        .slice(0, 5),
    [nodes, minConn]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return nodes.filter((n) => n.label.toLowerCase().includes(q)).slice(0, MAX_SEARCH_RESULTS);
  }, [query, nodes]);

  const sortedCommunities = useMemo(
    () => [...allCommunities].sort((a, b) => a - b),
    [allCommunities]
  );

  // Communities filtered by minConn: only show communities that have at least one node >= minConn
  const filteredCommunities = useMemo(() => {
    if (minConn <= 1) return sortedCommunities;
    const communitiesWithNodes = new Set(
      nodes.filter((n) => n.degree >= minConn).map((n) => n.community)
    );
    return sortedCommunities.filter((c) => communitiesWithNodes.has(c));
  }, [sortedCommunities, nodes, minConn]);

  function selectNode(id: string) {
    setSelectedNode(id);
    setTrail([]);
    setQuery("");
    setShowDropdown(false);
    // Best-effort: pan camera to the node. Index must match orderedNodes in GraphView.
    try {
      const idx = nodes.findIndex((n) => n.id === id);
      if (idx >= 0) cosmographRef.current?.focusPoint?.(idx);
    } catch {
      // focusPoint failure is non-critical; node detail still opens
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, overflowY: "auto", height: "100%" }}>

      {/* Stats — 3 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <StatCard label="Nodes" value={nodes.length.toLocaleString()} />
        <StatCard label="Edges" value={edges.length.toLocaleString()} />
        <StatCard label="Density" value={density.toFixed(3)} />
      </div>

      <SidebarSeparator />

      {/* Search */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#71717a",
              display: "flex",
              pointerEvents: "none",
            }}
          >
            <SearchIcon />
          </span>
          <input
            placeholder="Search entity…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 10,
              paddingLeft: 30,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              color: "white",
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocusCapture={(e) => (e.currentTarget.style.borderColor = "#52525b")}
            onBlurCapture={(e) => (e.currentTarget.style.borderColor = "#27272a")}
          />
        </div>
        {showDropdown && searchResults.length > 0 && (
          <ul
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 30,
              overflow: "hidden",
              borderRadius: 10,
              border: "1px solid #27272a",
              background: "#09090b",
              padding: 0,
              listStyle: "none",
            }}
          >
            {searchResults.map((n) => (
              <li key={n.id}>
                <button
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "#d4d4d8",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textTransform: "capitalize",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#18181b")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  onMouseDown={() => selectNode(n.id)}
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SidebarSeparator />

      {/* Top Bridges */}
      <SectionLabel>Top structural bridges</SectionLabel>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {top5.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => selectNode(n.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#18181b")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 13, color: "white", textTransform: "capitalize", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.label}
              </span>
              <span style={{ fontSize: 12, color: "#a1a1aa", fontVariantNumeric: "tabular-nums", fontFamily: "monospace", flexShrink: 0, marginLeft: 8 }}>
                {(n.betweenness_centrality * 100).toFixed(2)}%
              </span>
            </button>
          </li>
        ))}
        {top5.length === 0 && (
          <li style={{ fontSize: 12, color: "#52525b", fontStyle: "italic", padding: "8px 12px" }}>
            No nodes meet the filter.
          </li>
        )}
      </ul>

      <SidebarSeparator />

      {/* Domain filter */}
      <SectionLabel>Communities</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {filteredCommunities.map((c) => {
          const active = activeCommunities.has(c);
          const color = communityColor(c);
          const name = COMMUNITY_NAMES[c] ?? `Group ${c}`;
          return (
            <button
              key={c}
              onClick={() => toggleCommunity(c)}
              title={name}
              style={{
                borderRadius: 9999,
                padding: "4px 10px",
                fontSize: 11,
                border: active ? `1px solid ${color}44` : "1px solid #27272a",
                background: active ? `${color}22` : "#18181b",
                color: active ? color : "#71717a",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 150ms",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? color : "#3f3f46", flexShrink: 0 }} />
              {name}
            </button>
          );
        })}
      </div>

      <SidebarSeparator />

      {/* Min Connections Slider */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>Min. Connections</span>
          <span style={{ fontSize: 12, color: "white", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
            {minConn}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={maxDegree}
          value={minConn}
          onChange={(e) => setMinConn(Number(e.target.value))}
          style={{
            width: "100%",
            accentColor: "white",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}

/* ─── State 2: Node selected ───────────────────────────────────────────── */

interface NodeDetailProps {
  node: GraphNode;
  trail: string[];
  setSelectedNode: (id: string | null) => void;
  onBack: () => void;
  onBreadcrumbJump: (id: string, idx: number) => void;
  onNeighborClick: (id: string) => void;
}

function NodeDetail({ node, trail, onBack, onBreadcrumbJump, onNeighborClick }: NodeDetailProps) {
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const activeCommunities = useGraphStore((s) => s.activeCommunities);
  const egoMode = useGraphStore((s) => s.egoMode);
  const setEgoMode = useGraphStore((s) => s.setEgoMode);

  // Filter nodes/edges by active communities
  const { nodes, edges } = useMemo(() => {
    const filteredNodes = allNodes.filter((n) => activeCommunities.has(n.community));
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = allEdges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [allNodes, allEdges, activeCommunities]);

  const [docsExpanded, setDocsExpanded] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const DOCS_VISIBLE = 5;

  // Compute direct connections (neighbors)
  const neighbors = useMemo<GraphNode[]>(() => {
    const neighborIds = new Set(
      edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => (e.source === node.id ? e.target : e.source))
    );
    return nodes.filter((n) => neighborIds.has(n.id));
  }, [edges, nodes, node.id]);

  // Unique communities of neighbors
  const neighborCommunities = useMemo(
    () => [...new Set(neighbors.map((n) => n.community))],
    [neighbors]
  );

  // Top 2 neighbor communities by count
  const topNeighborCommunities = useMemo(() => {
    const counts = new Map<number, number>();
    neighbors.forEach((n) => counts.set(n.community, (counts.get(n.community) ?? 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([c]) => c);
  }, [neighbors]);

  // "Why a bridge?" text
  const bridgeText = useMemo(() => {
    const bPct = (node.betweenness_centrality * 100).toFixed(2);
    if (neighborCommunities.length <= 1) {
      const commLabel = neighborCommunities.length === 1 ? `Community ${neighborCommunities[0]}` : "its community";
      return `Acts as internal connector within ${commLabel}.`;
    }
    const [cA, cB] = topNeighborCommunities;
    return `Connects Community ${cA} and Community ${cB} with ${node.degree} direct links. ${bPct}% of all shortest paths route through this node.`;
  }, [node, neighborCommunities, topNeighborCommunities]);

  // AI summary text (deterministic, no API call)
  function generateAiSummary() {
    const bPct = (node.betweenness_centrality * 100).toFixed(2);
    const numCommunities = neighborCommunities.length;
    const commA = topNeighborCommunities[0] !== undefined ? `Community ${topNeighborCommunities[0]}` : "its community";
    const commB = topNeighborCommunities[1] !== undefined ? `Community ${topNeighborCommunities[1]}` : commA;
    const typeLabel = node.type === "PERSON" ? "individual" : node.type === "ORG" ? "organization" : "entity";

    setAiText(
      `${node.label.charAt(0).toUpperCase() + node.label.slice(1)} is a ${typeLabel} with a betweenness centrality of ${bPct}%, placing them among the most structurally critical nodes. They connect ${node.degree} entities across ${numCommunities} communit${numCommunities === 1 ? "y" : "ies"}, making them a key broker in the network. Removing this node would likely fragment connections between ${commA} and ${commB}.`
    );
  }

  // Visible docs
  const visibleDocs = docsExpanded ? node.source_docs : node.source_docs.slice(0, DOCS_VISIBLE);
  const hiddenCount = node.source_docs.length - DOCS_VISIBLE;

  // Breadcrumb trail node labels
  const trailNodes = useMemo(
    () => trail.map((id) => nodes.find((n) => n.id === id)),
    [trail, nodes]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Breadcrumb / Back */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", marginBottom: 12, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            color: "#71717a",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
        >
          <ChevronLeftIcon />
          <span>Overview</span>
        </button>

        {trailNodes.map((trailNode, idx) =>
          trailNode ? (
            <span key={trailNode.id} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#3f3f46", margin: "0 4px" }}>›</span>
              <button
                onClick={() => onBreadcrumbJump(trailNode.id, idx)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#71717a",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                  textTransform: "capitalize",
                  maxWidth: 80,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
              >
                {trailNode.label}
              </button>
            </span>
          ) : null
        )}

        {trail.length > 0 && (
          <span style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#3f3f46", margin: "0 4px" }}>›</span>
            <span
              style={{
                fontSize: 12,
                color: "#a1a1aa",
                textTransform: "capitalize",
                maxWidth: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.label}
            </span>
          </span>
        )}
      </div>

      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Entity header */}
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              display: "inline-block",
              background: `${communityColor(node.community)}22`,
              color: communityColor(node.community),
              border: `1px solid ${communityColor(node.community)}44`,
              fontSize: 11,
              borderRadius: 9999,
              padding: "2px 10px",
              marginBottom: 8,
            }}
          >
            {COMMUNITY_NAMES[node.community] ?? `Group ${node.community}`}
          </span>
          <h2
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              textTransform: "capitalize",
              lineHeight: 1.3,
            }}
          >
            {node.label}
          </h2>
          {node.wikidata_description && (
            <p style={{ fontSize: 11, color: "#a1a1aa", margin: "6px 0 0 0", lineHeight: 1.5 }}>
              {node.wikidata_description}
            </p>
          )}
        </div>

        <SidebarSeparator />

        {/* Metric cards */}
        <SectionLabel>Metrics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 4 }}>
          <MetricCard label="Betweenness" value={`${(node.betweenness_centrality * 100).toFixed(2)}%`} />
          <MetricCard label="Degree" value={String(node.degree)} />
          <MetricCard
            label="Clustering"
            value={node.clustering_coefficient != null ? node.clustering_coefficient.toFixed(3) : "—"}
          />
        </div>

        <SidebarSeparator />

        {/* Direct Connections */}
        {neighbors.length > 0 && (
          <>
            <SectionLabel>Direct connections ({neighbors.length})</SectionLabel>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                overflowX: "auto",
                gap: 6,
                paddingBottom: 4,
              }}
            >
              {neighbors.map((neighbor) => (
                <button
                  key={neighbor.id}
                  onClick={() => onNeighborClick(neighbor.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px",
                    borderRadius: 9999,
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "#d4d4d8",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flexShrink: 0,
                    textTransform: "capitalize",
                    transition: "all 150ms",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#27272a";
                    e.currentTarget.style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#18181b";
                    e.currentTarget.style.color = "#d4d4d8";
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: communityColor(neighbor.community),
                      flexShrink: 0,
                    }}
                  />
                  {neighbor.label}
                </button>
              ))}
            </div>
            <SidebarSeparator />
          </>
        )}

        {/* Why a bridge? */}
        <SectionLabel>Why a bridge?</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "#a1a1aa",
            lineHeight: 1.6,
            margin: "0 0 4px 0",
          }}
        >
          {bridgeText}
        </p>

        <SidebarSeparator />

        {/* Source documents */}
        <SectionLabel>Source documents</SectionLabel>
        {node.source_docs.length === 0 ? (
          <p style={{ fontSize: 12, color: "#52525b", fontStyle: "italic", margin: 0 }}>
            No documents linked.
          </p>
        ) : (
          <>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visibleDocs.map((doc) => (
                <li
                  key={doc.doc_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #27272a",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
                    <span style={{ color: "#52525b", flexShrink: 0 }}>
                      <FileTextIcon />
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#d4d4d8",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {doc.file_name || doc.doc_id}
                    </span>
                  </div>
                  <a
                    href={doc.online_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      textDecoration: "none",
                      flexShrink: 0,
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#e4e4e7")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
                  >
                    DOJ ↗
                  </a>
                </li>
              ))}
            </ul>
            {node.source_docs.length > DOCS_VISIBLE && (
              <button
                onClick={() => setDocsExpanded((x) => !x)}
                style={{
                  marginTop: 8,
                  background: "transparent",
                  border: "none",
                  color: "#71717a",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
              >
                {docsExpanded ? "Show less" : `Show ${hiddenCount} more`}
              </button>
            )}
          </>
        )}

        <SidebarSeparator />

        {/* Show only neighbors toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 13, color: "white" }}>Show only neighbors</span>
          <Switch checked={egoMode} onCheckedChange={setEgoMode} />
        </div>

        <SidebarSeparator />

        {/* AI Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={generateAiSummary}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 10,
              border: "1px solid #27272a",
              background: "#18181b",
              color: "#d4d4d8",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#27272a";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#18181b";
              e.currentTarget.style.color = "#d4d4d8";
            }}
          >
            <span style={{ fontSize: 14 }}>✦</span>
            Explain this node
          </button>

          {aiText && (
            <div
              style={{
                background: "#0f0f12",
                border: "1px solid #27272a",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  color: "#71717a",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 8px 0",
                  fontWeight: 500,
                }}
              >
                ✦ AI Analysis
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "#a1a1aa",
                  lineHeight: 1.6,
                  margin: 0,
                  textTransform: "capitalize",
                }}
              >
                {aiText}
              </p>
            </div>
          )}
        </div>

        {/* Bottom spacer */}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

/* ─── Shared primitives ────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        color: "#71717a",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 8,
        fontWeight: 500,
        marginTop: 0,
      }}
    >
      {children}
    </p>
  );
}

function SidebarSeparator() {
  return (
    <div
      style={{
        height: 1,
        background: "#27272a",
        margin: "16px 0",
      }}
    />
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#18181b",
        border: "1px solid #27272a",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "#71717a",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 4px 0",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 20,
          color: "white",
          fontWeight: 600,
          margin: 0,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#18181b",
        border: "1px solid #27272a",
        borderRadius: 12,
        padding: 10,
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "#71717a",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 4px 0",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 16,
          color: "white",
          fontWeight: 600,
          margin: 0,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}
