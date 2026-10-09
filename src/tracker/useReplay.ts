import { useEffect, useMemo, useState } from "react";
import { parseRecording, recordedPose, replayTrail, sampleIndex, type Recording } from "./replay";

export function useReplay(active: boolean) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [{ timeMs, playing }, setPlayback] = useState({ timeMs: 0, playing: false });
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !playing || !recording) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = (now - last) * speed; last = now;
      setPlayback((state) => {
        const timeMs = Math.min(recording.durationMs, state.timeMs + elapsed);
        return { timeMs, playing: timeMs < recording.durationMs };
      });
    }, 33);
    return () => clearInterval(timer);
  }, [active, playing, recording, speed]);
  const index = recording ? sampleIndex(recording.samples, timeMs) : -1;
  const sample = recording?.samples[index];
  const trail = useMemo(() => recording ? replayTrail(recording, index, timeMs) : [], [recording, index, timeMs]);
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
  return { recording, sample, pose: recordedPose(sample?.states.pose), trail, timeMs, playing, speed, error,
    load, toggle, setSpeed, setError,
    pause: () => setPlayback((state) => ({ ...state, playing: false })),
    seek: (time: number) => setPlayback({ timeMs: Math.max(0, Math.min(recording?.durationMs ?? 0, time)), playing: false }) };
}
