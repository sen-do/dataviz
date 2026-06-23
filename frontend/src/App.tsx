import { Navbar } from "@/components/Navbar";
import { GraphView } from "@/components/GraphView";
import { Sidebar } from "@/components/Sidebar";
import { MapControls } from "@/components/MapControls";
import { Legend } from "@/components/Legend";

export default function App() {
  return (
    <div
      className="dark"
      style={{ background: "#0D1117", width: "100vw", height: "100vh", overflow: "hidden" }}
    >
      <Navbar />
      <Sidebar />
      <MapControls />
      <Legend />

      <div className="absolute top-0 bottom-0 left-0 right-0">
        <GraphView />
      </div>
    </div>
  );
}
