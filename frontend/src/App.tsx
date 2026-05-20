import { Navbar } from "@/components/Navbar";
import { GraphView } from "@/components/GraphView";
import { Sidebar } from "@/components/Sidebar";
import { useGraphStore } from "@/store";

const SIDEBAR_WIDTH = 288;

export default function App() {
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);

  return (
    <div
      className="dark"
      style={{ background: "#0D1117", width: "100vw", height: "100vh", overflow: "hidden" }}
    >
      <Navbar />
      <Sidebar />

      {/* Graph canvas shifts right when sidebar is open */}
      <div
        className="absolute top-12 bottom-0 right-0 transition-[left] duration-300 ease-in-out"
        style={{ left: sidebarOpen ? SIDEBAR_WIDTH : 0 }}
      >
        <GraphView />
      </div>
    </div>
  );
}
