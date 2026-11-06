import { useEffect, useMemo, useRef, useState } from "react";
import { parseRecording, replayPose, replayTrail, sampleIndex, type Recording } from "./replay";
import { parsePathProgress } from "./followedPaths";
import { readCachedReplay, saveCachedReplay } from "./replayStorage";

export function useReplay(active: boolean, persistUpload = false) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [{ timeMs, playing }, setPlayback] = useState({ timeMs: 0, playing: false });
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  useEffect(() => {
    if (!persistUpload) return;
    let cancelled = false;
    const generation = loadGeneration.current;
    void readCachedReplay().then(text => {
      if (cancelled || generation !== loadGeneration.current || text === null) return;
      try {
        const next = parseRecording(text);
        setRecording(next);
        setPlayback({ timeMs: next.samples[0].timeMs, playing: false });
      } catch {
        setError("The saved recording could not be restored. Open the file again.");
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [persistUpload]);
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
  const paths = useMemo(() => recording?.paths.filter(path => path.timeMs <= timeMs) ?? [], [recording, timeMs]);
  const pathProgress = parsePathProgress(sample?.states.motionPath);
  const pose = recording ? replayPose(recording.samples, timeMs) : null;
  const trail = useMemo(() => {
    if (!recording) return [];
    const trail = replayTrail(recording, index, timeMs);
    const tip = replayPose(recording.samples, timeMs);
    if (tip && timeMs > (recording.samples[index]?.timeMs ?? timeMs)) trail.push(tip);
    return trail;
  }, [recording, index, timeMs]);
  function load(text: string) {
    loadGeneration.current += 1;
    try {
      const next = parseRecording(text);
      setRecording(next); setPlayback({ timeMs: next.samples[0].timeMs, playing: false }); setError(null);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read recording"); return false; }
  }
  async function importRecording(text: string) {
    if (!load(text) || !persistUpload) return;
    const generation = loadGeneration.current;
    try {
      await saveCachedReplay(text);
    } catch {
      if (generation === loadGeneration.current) setError("Recording loaded, but it could not be saved locally. It may not survive a refresh.");
    }
  }
  function toggle() {
    if (!recording || recording.durationMs <= recording.samples[0].timeMs) return;
    setPlayback((state) => ({
      timeMs: state.timeMs >= recording.durationMs ? recording.samples[0].timeMs : state.timeMs,
      playing: !state.playing,
    }));
  }
  return { recording, sample, pose, trail, paths, pathProgress, timeMs, playing, speed, error,
    load, importRecording, toggle, setSpeed, setError,
    pause: () => setPlayback((state) => ({ ...state, playing: false })),
    seek: (time: number) => setPlayback({ timeMs: Math.max(0, Math.min(recording?.durationMs ?? 0, time)), playing: false }) };
}
