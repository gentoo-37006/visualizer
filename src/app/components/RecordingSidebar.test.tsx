import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RecordingSidebar } from "./RecordingSidebar";
import type { useReplay } from "../../tracker/useReplay";

const replay: ReturnType<typeof useReplay> = {
  recording: null, sample: undefined, pose: null, trail: [], paths: [], pathProgress: null, timeMs: 0,
  playing: false, speed: 1, error: null, load: vi.fn(), toggle: vi.fn(),
  setSpeed: vi.fn(), setError: vi.fn(), pause: vi.fn(), seek: vi.fn(),
};
it("keeps local file import on the planner", () => {
  const html = renderToStaticMarkup(<RecordingSidebar replay={replay} showTrail onShowTrailChange={vi.fn()} />);
  expect(html).toContain("Open Recording");
  expect(html).toContain('type="file"');
});
it("replaces file import on the Hub without changing the replay body", () => {
  const html = renderToStaticMarkup(<RecordingSidebar replay={replay} showTrail onShowTrailChange={vi.fn()} sourceControl={<select aria-label="Hub recording"><option>Match</option></select>} />);
  expect(html).toContain("Hub recording");
  expect(html).not.toContain("Open Recording");
  expect(html).not.toContain('type="file"');
  expect(html).toContain("No recording selected");
});
