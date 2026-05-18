import { Navbar } from "@/components/Navbar";
import { GraphView } from "@/components/GraphView";
import { Sidebar } from "@/components/Sidebar";

export default function App() {
  return (
    <div className="dark" style={{ background: "#0D1117", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Navbar />
      {/* Graph canvas: full height minus navbar, full width minus sidebar (320px) */}
      <div className="absolute top-12 bottom-0 left-0 right-80">
        <GraphView />
      </div>
      <Sidebar />
    </div>
  );
}
