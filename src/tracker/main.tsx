import { createRoot } from "react-dom/client";
import { TrackerApp } from "./TrackerApp";

createRoot(document.getElementById("root")!).render(<TrackerApp assetBase="/visualizer" />);
