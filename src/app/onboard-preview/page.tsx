import type { Metadata } from "next";
import { TrackerApp } from "../../tracker/TrackerApp";

export const metadata: Metadata = { title: "Onboard Visualizer Preview" };

export default function OnboardPreviewPage() {
  return <TrackerApp preview />;
}
