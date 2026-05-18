import { useMemo, useState } from "react";
import { useGraphStore, useSelectedNode } from "@/store";
import { communityColor } from "@/lib/colors";
import { cosmographRef } from "@/graphRef";

const MAX_SEARCH_RESULTS = 8;
const MAX_SOURCE_DOCS = 5;

export function Sidebar() {
  const selectedNode = useSelectedNode();

  return (
    <aside className="fixed top-12 right-0 bottom-0 z-20 w-72 bg-[#0d1117]/80 backdrop-blur-md border-l border-white/10 flex flex-col overflow-hidden">
      {selectedNode ? <NodeDetail /> : <DefaultView />}
    </aside>
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

  // Network stats
  const totalNodes = nodes.length;
  const totalEdges = edges.length;

  // Top 5 bridge actors by betweenness
  const top5 = useMemo(
    () =>
      [...nodes]
        .sort((a, b) => b.betweenness_centrality - a.betweenness_centrality)
        .slice(0, 5),
    [nodes]
  );

  // Search results
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

  const allActive = activeCommunities.size === allCommunities.size;

  return (
    <div className="flex flex-col gap-5 p-4 overflow-y-auto">
      {/* Stats */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Network</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Nodes" value={totalNodes.toLocaleString()} />
          <Stat label="Edges" value={totalEdges.toLocaleString()} />
        </div>
      </div>

      {/* Search */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Search</p>
        <div className="relative">
          <input
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30"
            placeholder="Search entity…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
          {showDropdown && searchResults.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 bg-[#161b22] border border-white/10 rounded-md overflow-hidden z-30">
              {searchResults.map((n) => (
                <li key={n.id}>
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 capitalize"
                    onMouseDown={() => selectNode(n.id)}
                  >
                    {n.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Top 5 bridges */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
          Top structural bridges
        </p>
        <ul className="space-y-1">
          {top5.map((n, i) => (
            <li key={n.id}>
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left group"
                onClick={() => selectNode(n.id)}
              >
                <span className="text-white/20 text-xs w-4 shrink-0">{i + 1}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: communityColor(n.community) }}
                />
                <span className="text-sm text-white/80 group-hover:text-white capitalize truncate flex-1">
                  {n.label}
                </span>
                <span className="text-xs text-white/30 tabular-nums shrink-0">
                  {(n.betweenness_centrality * 100).toFixed(2)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Domain filter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Communities</p>
          <button
            className="text-[10px] text-white/30 hover:text-white/60"
            onClick={() => setAllCommunities(!allActive)}
          >
            {allActive ? "Hide all" : "Show all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sortedCommunities.map((c) => {
            const active = activeCommunities.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCommunity(c)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-opacity ${
                  active
                    ? "border-white/20 text-white/70"
                    : "border-white/10 text-white/20 opacity-50"
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
      </div>
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
    <div className="flex flex-col overflow-hidden h-full">
      {/* Back */}
      <button
        className="flex items-center gap-1.5 px-4 py-3 text-xs text-white/40 hover:text-white/70 border-b border-white/10"
        onClick={() => setSelectedNode(null)}
      >
        ← Back
      </button>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        {/* Entity header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border text-white/50"
              style={{ borderColor: `${color}60` }}
            >
              Community {node.community}
            </span>
            <span className="text-[10px] text-white/30 uppercase">{node.type}</span>
          </div>
          <h2 className="text-white font-semibold text-base capitalize leading-snug">
            {node.label}
          </h2>
        </div>

        {/* Metrics */}
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Metrics</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Betweenness"
              value={`${(node.betweenness_centrality * 100).toFixed(2)}%`}
            />
            <Stat label="Degree" value={String(node.degree)} />
            <Stat
              label="Clustering"
              value={
                node.clustering_coefficient != null
                  ? node.clustering_coefficient.toFixed(3)
                  : "—"
              }
            />
          </div>
        </div>

        {/* Ego-network toggle */}
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">View</p>
          <button
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
              egoMode
                ? "bg-white/10 border-white/30 text-white"
                : "bg-white/0 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
            }`}
            onClick={() => setEgoMode(!egoMode)}
          >
            <span>Show only neighbors</span>
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                egoMode ? "bg-white border-white" : "bg-transparent border-white/30"
              }`}
            />
          </button>
        </div>

        {/* Source documents */}
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
            Source documents
          </p>
          {node.source_docs.length === 0 ? (
            <p className="text-xs text-white/30 italic">No documents linked.</p>
          ) : (
            <ul className="space-y-2">
              {node.source_docs.slice(0, MAX_SOURCE_DOCS).map((doc) => (
                <li key={doc.doc_id}>
                  <a
                    href={doc.online_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline break-all leading-relaxed block"
                  >
                    {doc.file_name || doc.doc_id}
                  </a>
                </li>
              ))}
              {node.source_docs.length > MAX_SOURCE_DOCS && (
                <li className="text-xs text-white/30">
                  +{node.source_docs.length - MAX_SOURCE_DOCS} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared ───────────────────────────────────────────────────────────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-md px-2.5 py-2">
      <p className="text-[10px] text-white/30 mb-0.5 truncate">{label}</p>
      <p className="text-sm text-white font-medium tabular-nums">{value}</p>
    </div>
  );
}
