import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { TrackerApp } from "./TrackerApp";

createRoot(document.getElementById("root")!).render(<TrackerApp assetBase="/visualizer" />);
