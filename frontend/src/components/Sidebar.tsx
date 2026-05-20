import { useMemo, useState } from "react";
import { useGraphStore, useSelectedNode } from "@/store";
import { communityColor } from "@/lib/colors";
import { cosmographRef } from "@/graphRef";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const SIDEBAR_WIDTH = 288;
const MAX_SEARCH_RESULTS = 8;
const MAX_SOURCE_DOCS = 5;

export function Sidebar() {
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const selectedNode = useSelectedNode();

  return (
    <>
      {/* Sidebar panel */}
      <aside
        className="fixed top-12 bottom-0 left-0 z-20 flex flex-col overflow-hidden"
        style={{
          width: SIDEBAR_WIDTH,
          background: "oklch(0.09 0 0)",
          border: "1px solid oklch(0.2 0 0)",
          borderLeft: "none",
          borderRadius: "0 20px 20px 0",
          transform: sidebarOpen ? "translateX(0)" : `translateX(-${SIDEBAR_WIDTH}px)`,
          transition: "transform 300ms ease",
        }}
      >
        {selectedNode ? <NodeDetail /> : <DefaultView />}
      </aside>

      {/* Collapse toggle — follows the right edge of the sidebar */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        className="fixed z-30 top-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{
          left: sidebarOpen ? SIDEBAR_WIDTH - 12 : 0,
          width: 24,
          height: 48,
          background: "oklch(0.12 0 0)",
          border: "1px solid oklch(0.2 0 0)",
          borderLeft: sidebarOpen ? "none" : "1px solid oklch(0.2 0 0)",
          borderRadius: sidebarOpen ? "0 8px 8px 0" : "0 8px 8px 0",
          transition: "left 300ms ease",
          cursor: "pointer",
          color: "oklch(0.5 0 0)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "oklch(0.5 0 0)")}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>
          {sidebarOpen ? "‹" : "›"}
        </span>
      </button>
    </>
  );
}

/* ─── State 1: Default ─────────────────────────────────────────────────── */

function DefaultView() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const allCommunities = useGraphStore((s) => s.allCommunities);
  const activeCommunities = useGraphStore((s) => s.activeCommunities);
  const toggleCommunity = useGraphStore((s) => s.toggleCommunity);
  const setAllCommunities = useGraphStore((s) => s.setAllCommunities);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const top5 = useMemo(
    () =>
      [...nodes]
        .sort((a, b) => b.betweenness_centrality - a.betweenness_centrality)
        .slice(0, 5),
    [nodes]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return nodes.filter((n) => n.label.includes(q)).slice(0, MAX_SEARCH_RESULTS);
  }, [query, nodes]);

  function selectNode(id: string) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx >= 0) cosmographRef.current?.focusPoint(idx);
    setSelectedNode(id);
    setQuery("");
    setShowDropdown(false);
  }

  const sortedCommunities = useMemo(
    () => [...allCommunities].sort((a, b) => a - b),
    [allCommunities]
  );

  return (
    <div className="flex flex-col gap-0 overflow-y-auto h-full py-4 text-sm">
      {/* Stats */}
      <Section label="Network">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Nodes" value={nodes.length.toLocaleString()} />
          <StatCard label="Edges" value={edges.length.toLocaleString()} />
        </div>
      </Section>

      <SidebarSeparator />

      {/* Search */}
      <Section label="Search">
        <div className="relative">
          <Input
            placeholder="Search entity…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="bg-white/5 border-zinc-700 text-white placeholder:text-zinc-500 h-8 text-xs rounded-lg focus-visible:border-zinc-500 focus-visible:ring-0"
          />
          {showDropdown && searchResults.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 z-30 overflow-hidden rounded-xl border border-zinc-800"
              style={{ background: "oklch(0.12 0 0)" }}>
              {searchResults.map((n) => (
                <li key={n.id}>
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 capitalize"
                    onMouseDown={() => selectNode(n.id)}
                  >
                    {n.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <SidebarSeparator />

      {/* Top 5 bridges */}
      <Section label="Top structural bridges">
        <ul className="space-y-0.5">
          {top5.map((n, i) => (
            <li key={n.id}>
              <button
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 text-left group transition-colors"
                onClick={() => selectNode(n.id)}
              >
                <span className="text-zinc-600 text-xs w-3 shrink-0 tabular-nums">{i + 1}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: communityColor(n.community) }}
                />
                <span className="text-xs text-zinc-300 group-hover:text-white capitalize truncate flex-1 transition-colors">
                  {n.label}
                </span>
                <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                  {(n.betweenness_centrality * 100).toFixed(2)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <SidebarSeparator />

      {/* Community filter */}
      <Section label="Communities">
        <div className="flex items-center justify-between mb-2">
          <span />
          <button
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={() => setAllCommunities(activeCommunities.size < allCommunities.size)}
          >
            {activeCommunities.size < allCommunities.size ? "Show all" : "Hide all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sortedCommunities.map((c) => {
            const active = activeCommunities.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCommunity(c)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] border transition-all ${
                  active
                    ? "border-zinc-600 text-zinc-300"
                    : "border-zinc-800 text-zinc-600 opacity-50"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: communityColor(c) }}
                />
                {c}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/* ─── State 2: Node selected ───────────────────────────────────────────── */

function NodeDetail() {
  const node = useSelectedNode()!;
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const egoMode = useGraphStore((s) => s.egoMode);
  const setEgoMode = useGraphStore((s) => s.setEgoMode);

  const color = communityColor(node.community);

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm">
      {/* Back */}
      <button
        className="flex items-center gap-1.5 px-4 py-3 text-xs text-zinc-500 hover:text-zinc-200 transition-colors border-b border-zinc-800/60 shrink-0"
        onClick={() => setSelectedNode(null)}
      >
        <span className="text-[10px]">←</span> Back
      </button>

      <div className="flex flex-col gap-0 overflow-y-auto flex-1 py-4">
        {/* Entity header */}
        <Section label={undefined}>
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 rounded-full border-zinc-700 text-zinc-400"
            >
              {node.type}
            </Badge>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ borderColor: `${color}50`, color }}
            >
              Community {node.community}
            </span>
          </div>
          <h2 className="text-white font-semibold text-sm capitalize leading-snug">
            {node.label}
          </h2>
        </Section>

        <SidebarSeparator />

        {/* Metrics */}
        <Section label="Metrics">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Betweenness" value={`${(node.betweenness_centrality * 100).toFixed(2)}%`} />
            <StatCard label="Degree" value={String(node.degree)} />
            <StatCard
              label="Clustering"
              value={node.clustering_coefficient != null ? node.clustering_coefficient.toFixed(3) : "—"}
            />
          </div>
        </Section>

        <SidebarSeparator />

        {/* Ego toggle */}
        <Section label="View">
          <button
            onClick={() => setEgoMode(!egoMode)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-all ${
              egoMode
                ? "bg-white/10 border-zinc-600 text-white"
                : "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            Show only neighbors
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                egoMode ? "bg-white border-white" : "bg-transparent border-zinc-600"
              }`}
            />
          </button>
        </Section>

        <SidebarSeparator />

        {/* Source docs */}
        <Section label="Source documents">
          {node.source_docs.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">No documents linked.</p>
          ) : (
            <ul className="space-y-2">
              {node.source_docs.slice(0, MAX_SOURCE_DOCS).map((doc) => (
                <li key={doc.doc_id}>
                  <a
                    href={doc.online_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400/80 hover:text-blue-400 hover:underline break-all leading-relaxed block transition-colors"
                  >
                    {doc.file_name || doc.doc_id}
                  </a>
                </li>
              ))}
              {node.source_docs.length > MAX_SOURCE_DOCS && (
                <li className="text-[10px] text-zinc-600">
                  +{node.source_docs.length - MAX_SOURCE_DOCS} more
                </li>
              )}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ─── Shared primitives ────────────────────────────────────────────────── */

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      {label && (
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2.5 font-medium">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function SidebarSeparator() {
  return <Separator className="bg-zinc-800/60 mx-4" style={{ width: "calc(100% - 32px)" }} />;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-2.5 py-2" style={{ background: "oklch(0.13 0 0)" }}>
      <p className="text-[10px] text-zinc-500 mb-0.5 truncate">{label}</p>
      <p className="text-xs text-white font-medium tabular-nums">{value}</p>
    </div>
  );
}
