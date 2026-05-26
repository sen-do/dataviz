import { useState } from "react";
import { cosmographRef } from "@/graphRef";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RotateCcwIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.87" />
    </svg>
  );
}

// We track zoom level in a ref-like manner since cosmograph doesn't expose getZoomLevel easily.
// We maintain a local state starting at 1 and adjust relatively.
let currentZoom = 1;

export function MapControls() {
  const [, forceUpdate] = useState(0);

  function zoomIn() {
    currentZoom = currentZoom * 1.5;
    cosmographRef.current?.setZoomLevel(currentZoom, 300);
    forceUpdate((n) => n + 1);
  }

  function zoomOut() {
    currentZoom = currentZoom * 0.67;
    cosmographRef.current?.setZoomLevel(currentZoom, 300);
    forceUpdate((n) => n + 1);
  }

  function fitView() {
    currentZoom = 1;
    cosmographRef.current?.fitView(500);
    forceUpdate((n) => n + 1);
  }

  const btnStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid #27272a",
    background: "#09090b",
    color: "#a1a1aa",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
    transition: "all 150ms",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <button
        style={btnStyle}
        onClick={zoomIn}
        title="Zoom in"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#18181b";
          e.currentTarget.style.color = "white";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#09090b";
          e.currentTarget.style.color = "#a1a1aa";
        }}
      >
        <PlusIcon />
      </button>

      <button
        style={btnStyle}
        onClick={zoomOut}
        title="Zoom out"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#18181b";
          e.currentTarget.style.color = "white";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#09090b";
          e.currentTarget.style.color = "#a1a1aa";
        }}
      >
        <MinusIcon />
      </button>

      <button
        style={btnStyle}
        onClick={fitView}
        title="Fit view"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#18181b";
          e.currentTarget.style.color = "white";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#09090b";
          e.currentTarget.style.color = "#a1a1aa";
        }}
      >
        <RotateCcwIcon />
      </button>
    </div>
  );
}
