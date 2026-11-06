import { useEffect, useRef, useState } from "react";
import { appendTrail, getFeedStatus, parsePoseSnapshot, type PoseSnapshot, type TrailSample } from "./telemetry";

export function usePoseFeed(endpoint: string, paused: boolean) {
  const [snapshot, setSnapshot] = useState<PoseSnapshot | null>(null);
  const [trail, setTrail] = useState<TrailSample[]>([]);
  const [receivedAt, setReceivedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState(false);
  const previous = useRef<{ sessionId: number; sequence: number } | null>(null);

  useEffect(() => {
    if (paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const clock = setInterval(() => setNow(performance.now()), 250);
    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Pose feed unavailable");
        const next = parsePoseSnapshot(await response.json());
        if (!next) throw new Error("Invalid pose snapshot");
        if (stopped) return;
        const time = performance.now();
        const sessionChanged = next.sessionId !== previous.current?.sessionId;
        if (sessionChanged || next.sequence !== previous.current?.sequence) {
          setTrail((current) => appendTrail(sessionChanged ? [] : current, next, time));
        }
        previous.current = next;
        setSnapshot(next);
        setReceivedAt(time);
        setNow(time);
        setFailed(false);
      } catch {
        if (!stopped) {
          setFailed(true);
          setNow(performance.now());
        }
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(poll, 50);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
      controller?.abort();
    };
  }, [endpoint, paused]);

  const ageMs = snapshot?.ageMs == null ? null : snapshot.ageMs + Math.max(0, now - receivedAt);
  return { snapshot, trail, ageMs, status: getFeedStatus(snapshot, receivedAt, now, failed, paused), clearTrail: () => setTrail([]) };
}
