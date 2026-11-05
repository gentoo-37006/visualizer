import { TrackerApp } from "../../tracker/TrackerApp";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Onboard Visualizer" };

export default function VisualizerPage() {
  return <TrackerApp />;
}
