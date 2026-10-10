import { useEffect, useMemo, useState } from "react";
import { parseRecording, replayPose, replayTrail, sampleIndex, type Recording } from "./replay";

export function useReplay(active: boolean) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [{ timeMs, playing }, setPlayback] = useState({ timeMs: 0, playing: false });
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !playing || !recording) return;
    let last = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const elapsed = (now - last) * speed; last = now;
      setPlayback((state) => {
        const timeMs = Math.min(recording.durationMs, state.timeMs + elapsed);
        return { timeMs, playing: timeMs < recording.durationMs };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, playing, recording, speed]);
  const index = recording ? sampleIndex(recording.samples, timeMs) : -1;
  const sample = recording?.samples[index];
  const pose = recording ? replayPose(recording.samples, timeMs) : null;
  const trail = useMemo(() => {
    if (!recording) return [];
    const trail = replayTrail(recording, index, timeMs);
    const tip = replayPose(recording.samples, timeMs);
    if (tip && timeMs > (recording.samples[index]?.timeMs ?? timeMs)) trail.push(tip);
    return trail;
  }, [recording, index, timeMs]);
  function load(text: string) {
    try {
      const next = parseRecording(text);
      setRecording(next); setPlayback({ timeMs: next.samples[0].timeMs, playing: false }); setError(null);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read recording"); return false; }
  }
  function toggle() {
    if (!recording || recording.durationMs <= recording.samples[0].timeMs) return;
    setPlayback((state) => ({
      timeMs: state.timeMs >= recording.durationMs ? recording.samples[0].timeMs : state.timeMs,
      playing: !state.playing,
    }));
  }
  return { recording, sample, pose, trail, timeMs, playing, speed, error,
    load, toggle, setSpeed, setError,
    pause: () => setPlayback((state) => ({ ...state, playing: false })),
    seek: (time: number) => setPlayback({ timeMs: Math.max(0, Math.min(recording?.durationMs ?? 0, time)), playing: false }) };
}
