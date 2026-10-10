"use client";

import { useEffect, useRef, useState } from "react";
import { FieldViewport } from "../field/FieldViewport";
import { RobotLayer } from "../field/RobotLayer";
import { TrailLayer } from "../field/TrailLayer";
import { PlaybackControls } from "../app/components/PlaybackControls";
import { RecordingSidebar } from "../app/components/RecordingSidebar";
import { FIELD_BORDER_WIDTH, POINT_RADIUS } from "../app/plannerConstants";
import { usePoseFeed } from "./usePoseFeed";
import { useReplay } from "./useReplay";
import { MAX_RECORDING_BYTES } from "./replay";
import styles from "../app/page.module.css";
import tracker from "./tracker.module.css";

const fields = [
  { id: "biobuzz", name: "Biobuzz" },
  { id: "decode", name: "Decode" },
  { id: "intothedeep", name: "Into The Deep" },
  { id: "centerstage", name: "Centerstage" },
];

export function TrackerApp({ assetBase = "", endpoint = "/yb/pose" }: { assetBase?: string; endpoint?: string }) {
  const [field, setField] = useState("biobuzz");
  const [showTrail, setShowTrail] = useState(true);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [files, setFiles] = useState<{ name: string; bytes: number }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [fieldSize, setFieldSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = fieldRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFieldSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const live = usePoseFeed(endpoint, paused || mode === "replay");
  const replay = useReplay(mode === "replay");
  const pose = mode === "live" ? live.snapshot?.pose : replay.pose;
  const robot = mode === "live" ? live.snapshot?.robot : replay.recording?.robot;
  const trail = mode === "live" ? live.trail : replay.trail;
  const viewport = { ...fieldSize, padding: POINT_RADIUS, border: FIELD_BORDER_WIDTH };
  function changeMode(next: "live" | "replay") {
    if (next === "live") replay.pause();
    setMode(next);
  }
  async function refreshFiles() {
    setBusy(true); replay.setError(null);
    try {
      const response = await fetch("/yb/recordings", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every((f) => typeof f?.name === "string" && typeof f?.bytes === "number")) throw new Error();
      setFiles(data); setSelected(data[0]?.name ?? "");
    } catch { replay.setError("Could not list Hub recordings"); }
    finally { setBusy(false); }
  }
  async function openHubFile() {
    setBusy(true);
    try {
      if ((files.find((f) => f.name === selected)?.bytes ?? 0) > MAX_RECORDING_BYTES) throw new Error();
      const response = await fetch(`/yb/recording?name=${encodeURIComponent(selected)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      replay.load(await response.text());
    } catch { replay.setError("Could not open Hub recording"); }
    finally { setBusy(false); }
  }
  const fieldControl = <label className={tracker.selectLabel}>Field<select value={field} onChange={(event) => setField(event.target.value)}>{fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;

  return <main className={`${styles.container} ${tracker.container}`}>
    <div className={`${styles.fieldWrapper} ${tracker.fieldWrapper}`}>
      <FieldViewport image={`${assetBase}/fields/${field}.webp`} width={fieldSize.width} height={fieldSize.height} padding={POINT_RADIUS} containerRef={fieldRef} className={styles.fieldContainer} imageClassName={styles.fieldImage} overlayClassName={styles.svgOverlay}>
        {fieldSize.width > 0 && <>
          {showTrail && <TrailLayer poses={trail} viewport={viewport} />}
          {pose && robot && <RobotLayer pose={pose} size={robot} viewport={viewport} image={`${assetBase}/robot.png`} />}
        </>}
      </FieldViewport>
    </div>
    <div className={styles.sidebarColumn}>
      <div className={styles.modeTabs} role="tablist" aria-label="Visualizer mode" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "live" : event.key === "End" ? "replay" : mode === "live" ? "replay" : "live";
        changeMode(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
      }}>
        <button id="live-tab" role="tab" aria-selected={mode === "live"} aria-controls="live-panel" tabIndex={mode === "live" ? 0 : -1} onClick={() => changeMode("live")}>Live</button>
        <button id="replay-tab" role="tab" aria-selected={mode === "replay"} aria-controls="replay-panel" tabIndex={mode === "replay" ? 0 : -1} onClick={() => changeMode("replay")}>Replay</button>
      </div>
      <div className={styles.modePanel} role="tabpanel" id={`${mode}-panel`} aria-labelledby={`${mode}-tab`}>
        {mode === "live" ? <aside className={styles.sidebar} aria-label="Live">
          <header className={styles.sidebarHeader}>
            <div className={styles.sidebarTitleRow}>
              <h2 className={styles.sidebarTitle}>Live</h2>
              <span role="status" className={tracker.status} data-live={live.status === "Live"}>{live.status}</span>
            </div>
          </header>
          <div className={`${styles.pointsList} ${styles.recordingContent}`}>
            <div className={styles.recordingMeta}><strong>{live.snapshot?.opMode ?? "No active opmode"}</strong></div>
            <section className={styles.recordingSection} aria-label="Live robot position">
              <h3>Robot Position</h3>
              <dl className={styles.recordingReadouts}>
                <div><dt>X (in)</dt><dd>{pose?.x.toFixed(1) ?? "--"}</dd></div>
                <div><dt>Y (in)</dt><dd>{pose?.y.toFixed(1) ?? "--"}</dd></div>
                <div><dt>Heading (deg)</dt><dd>{pose?.heading.toFixed(1) ?? "--"}</dd></div>
                <div><dt>Width (in)</dt><dd>{robot?.width.toFixed(2) ?? "--"}</dd></div>
                <div><dt>Length (in)</dt><dd>{robot?.length.toFixed(2) ?? "--"}</dd></div>
              </dl>
            </section>
            {fieldControl}
            <div className={styles.recordingOptions}>
              <label className={styles.recordingTrailToggle}><input type="checkbox" checked={!paused} onChange={(event) => setPaused(!event.target.checked)} />Live updates</label>
              <label className={styles.recordingTrailToggle}><input type="checkbox" checked={showTrail} onChange={(event) => setShowTrail(event.target.checked)} />Movement trail</label>
            </div>
            <button className={styles.recordingRestartButton} onClick={live.clearTrail} disabled={trail.length === 0}>Clear Trail</button>
          </div>
        </aside> : <>
          <RecordingSidebar replay={replay} showTrail={showTrail} onShowTrailChange={setShowTrail}>
            {fieldControl}
            <section className={styles.recordingSection} aria-label="Hub recordings">
              <div className={tracker.hubHeading}><h3>Hub Recordings</h3><button className={styles.recordingRestartButton} disabled={busy} onClick={() => void refreshFiles()}>{busy ? "Loading..." : "Refresh Hub"}</button></div>
              {files.length > 0 && <>
                <label className={tracker.selectLabel}>Recording<select value={selected} onChange={(event) => setSelected(event.target.value)}>{files.map((file) => <option key={file.name} value={file.name}>{new Date(Number(file.name.split("-")[0])).toLocaleString()} ({Math.ceil(file.bytes / 1024)} KB)</option>)}</select></label>
                <div className={tracker.actions}><button className={styles.recordingRestartButton} disabled={busy || !selected} onClick={() => void openHubFile()}>Open</button><a className={styles.recordingRestartButton} href={`/yb/recording?name=${encodeURIComponent(selected)}`} download>Download</a></div>
              </>}
            </section>
          </RecordingSidebar>
          <PlaybackControls mode="recording" disabled={!replay.recording || replay.recording.durationMs <= replay.recording.samples[0].timeMs} isRunning={replay.playing} currentTime={replay.timeMs / 1000} totalTime={(replay.recording?.durationMs ?? 0) / 1000} accentColor="#2dd4bf" trackBackground="var(--border)" onToggle={replay.toggle} onScrub={(time) => replay.seek(time * 1000)} />
        </>}
      </div>
    </div>
  </main>;
}
