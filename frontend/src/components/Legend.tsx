import { useState } from "react";
import { COMMUNITY_COLORS } from "@/lib/colors";

// A handful of community colours to illustrate the colour encoding.
const SAMPLE_COLORS = [COMMUNITY_COLORS[4], COMMUNITY_COLORS[0], COMMUNITY_COLORS[2]];

const containerStyle: React.CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  zIndex: 20,
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 10,
  color: "#a1a1aa",
  fontSize: 11,
  fontFamily: "inherit",
  minWidth: 180,
  userSelect: "none",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "7px 10px",
  cursor: "pointer",
  gap: 8,
};

const bodyStyle: React.CSSProperties = {
  padding: "4px 10px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  color: "#a1a1aa",
  lineHeight: 1.3,
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: "transform 150ms", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Two circles of different sizes to illustrate node-size encoding.
function SizeIcon() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14">
      <circle cx="5" cy="7" r="4" fill="#a1a1aa" opacity="0.5" />
      <circle cx="19" cy="7" r="7" fill="#a1a1aa" opacity="0.9" />
    </svg>
  );
}

// Two circles with distinct community colours.
function ColorIcon() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14">
      {SAMPLE_COLORS.map((c, i) => (
        <circle key={c} cx={5 + i * 9} cy={7} r={4} fill={c} />
      ))}
    </svg>
  );
}

// A thin line and a thick line side by side.
function EdgeIcon() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14">
      <line x1="2" y1="5" x2="26" y2="5" stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <line x1="2" y1="10" x2="26" y2="10" stroke="#a1a1aa" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

export function Legend() {
  const [open, setOpen] = useState(true);

  return (
    <div style={containerStyle}>
      <div style={headerStyle} onClick={() => setOpen((o) => !o)}>
        <span style={{ color: "#71717a", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10 }}>
          Legend
        </span>
        <ChevronIcon open={open} />
      </div>

      {open && (
        <div style={bodyStyle}>
          <div style={rowStyle}>
            <SizeIcon />
            <span style={labelStyle}>Size = influence</span>
          </div>
          <div style={rowStyle}>
            <ColorIcon />
            <span style={labelStyle}>Colour = community</span>
          </div>
          <div style={rowStyle}>
            <EdgeIcon />
            <span style={labelStyle}>Thickness = co-occurrence</span>
          </div>
        </div>
      )}
    </div>
  );
}
