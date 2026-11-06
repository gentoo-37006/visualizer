import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaybackControls } from "./PlaybackControls";

const props = {
  isRunning: false, currentTime: 0, totalTime: 0,
  accentColor: "#2dd4bf", trackBackground: "red", onToggle: vi.fn(), onScrub: vi.fn(),
};

describe("playback controls", () => {
  it("disables empty playback and replaces colored track/thumb with gray", () => {
    const html = renderToStaticMarkup(<PlaybackControls {...props} />);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('--playback-track:#4b4b4b');
    expect(html).toContain('--playback-color:#707070');
  });
  it("uses a white replay thumb and elapsed fill", () => {
    const html = renderToStaticMarkup(<PlaybackControls {...props} mode="recording" totalTime={10} currentTime={5} />);
    expect(html).toContain('--playback-color:#ffffff');
    expect(html).toContain('#ffffff 50%');
    expect(html).not.toContain('disabled=""');
  });
  it.each([[0, '0%'], [2.5, '25%'], [10, '100%']])("fills the center-to-center track proportionally at %s seconds", (currentTime, position) => {
    const html = renderToStaticMarkup(<PlaybackControls {...props} mode="recording" totalTime={10} currentTime={currentTime} />);
    expect(html).toContain(`#ffffff ${position}, var(--border) ${position}`);
  });
  it("preserves colored path timelines and enlarges the play/pause icons", () => {
    const html = renderToStaticMarkup(<PlaybackControls {...props} totalTime={10} />);
    expect(html).toContain('--playback-track:red');
    expect(html).toContain('--playback-color:color-mix(in srgb, #2dd4bf 75%, #ffffff 25%)');
    expect(html).toContain('width="26" height="26"');
    const paused = renderToStaticMarkup(<PlaybackControls {...props} totalTime={10} isRunning />);
    expect(paused).toContain('width="26" height="26"');
  });
  it("hatches only the over-limit path timeline, starting exactly at 30 seconds", () => {
    const over = renderToStaticMarkup(<PlaybackControls {...props} totalTime={60} />);
    expect(over).toContain('left:50%');
    const within = renderToStaticMarkup(<PlaybackControls {...props} totalTime={30} />);
    expect(within).not.toContain('left:');
    const replay = renderToStaticMarkup(<PlaybackControls {...props} totalTime={60} mode="recording" />);
    expect(replay).not.toContain('left:');
  });
});
