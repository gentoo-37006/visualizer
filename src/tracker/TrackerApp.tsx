"use client";

import { useRef, useState } from "react";
import { FieldViewport } from "../field/FieldViewport";
import { RobotLayer } from "../field/RobotLayer";
import { TrailLayer } from "../field/TrailLayer";
import { usePoseFeed } from "./usePoseFeed";
import { useReplay } from "./useReplay";
import { MAX_RECORDING_BYTES } from "./replay";
import styles from "./tracker.module.css";

const fields = [
  { id: "biobuzz", name: "Biobuzz" },
  { id: "decode", name: "Decode" },
  { id: "intothedeep", name: "Into The Deep" },
  { id: "centerstage", name: "Centerstage" },
];
const viewport = { width: 1000, height: 1000, padding: 0, border: 3 };

export function TrackerApp({ assetBase = "", endpoint = "/yb/pose" }: { assetBase?: string; endpoint?: string }) {
  const [field, setField] = useState("biobuzz");
  const [showTrail, setShowTrail] = useState(true);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [files, setFiles] = useState<{ name: string; bytes: number }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const live = usePoseFeed(endpoint, paused || mode === "replay");
  const replay = useReplay(mode === "replay");
  const pose = mode === "live" ? live.snapshot?.pose : replay.pose;
  const robot = mode === "live" ? live.snapshot?.robot : replay.recording?.robot;
  const trail = mode === "live" ? live.trail : replay.trail;
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_RECORDING_BYTES) { replay.setError("Recording exceeds 32 MB"); return; }
    try { if (replay.load(await file.text())) setMode("replay"); }
    catch { replay.setError("Could not read file"); }
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
      if (replay.load(await response.text())) setMode("replay");
    } catch { replay.setError("Could not open Hub recording"); }
    finally { setBusy(false); }
  }
  return <main className={styles.app}>
    <header className={styles.header}>
      <h1>Field Tracker</h1>
      <div className={styles.modes} role="group" aria-label="View">
        <button aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live</button>
        <button aria-pressed={mode === "replay"} onClick={() => setMode("replay")}>Replay</button>
      </div>
      <span role="status" className={styles.status} data-live={mode === "live" && live.status === "Live"}>{mode === "live" ? live.status : replay.playing ? "Playing" : "Paused"}</span>
      <span className={styles.opMode}>{mode === "live" ? live.snapshot?.opMode ?? "No active opmode" : replay.recording?.opMode ?? "No recording"}</span>
    </header>
    <div className={styles.workspace}>
      <div className={styles.field}>
        <FieldViewport image={`${assetBase}/fields/${field}.webp`} width={viewport.width} height={viewport.height} imageClassName={styles.fieldImage}>
          {showTrail && <TrailLayer poses={trail} viewport={viewport} />}
          {pose && robot && <RobotLayer pose={pose} size={robot} viewport={viewport} image={`${assetBase}/robot.png`} />}
        </FieldViewport>
      </div>
      <aside className={styles.sidebar}>
        <h2>Robot Position</h2>
        <dl className={styles.readouts}>
          <div><dt>X (in)</dt><dd>{pose ? pose.x.toFixed(1) : "--"}</dd></div>
          <div><dt>Y (in)</dt><dd>{pose ? pose.y.toFixed(1) : "--"}</dd></div>
          <div><dt>Heading (deg)</dt><dd>{pose ? pose.heading.toFixed(1) : "--"}</dd></div>
          <div><dt>Width (in)</dt><dd>{robot ? robot.width.toFixed(2) : "--"}</dd></div>
          <div><dt>Length (in)</dt><dd>{robot ? robot.length.toFixed(2) : "--"}</dd></div>
        </dl>
        <label className={styles.fieldLabel}>Field<select value={field} onChange={(event) => setField(event.target.value)}>{fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {mode === "live" && <label className={styles.toggle}><input type="checkbox" checked={!paused} onChange={(event) => setPaused(!event.target.checked)} />Live updates</label>}
        <label className={styles.toggle}><input type="checkbox" checked={showTrail} onChange={(event) => setShowTrail(event.target.checked)} />Movement trail</label>
        {mode === "live" && <button className={styles.clear} onClick={live.clearTrail} disabled={trail.length === 0}>Clear Trail</button>}
        {mode === "replay" && <section className={styles.replay}>
          <h2>Recording</h2>
          <input ref={input} type="file" accept=".jsonl,.ndjson" hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
          <div className={styles.actions}><button onClick={() => input.current?.click()}>Open File</button><button disabled={busy} onClick={() => void refreshFiles()}>Refresh Hub</button></div>
          {files.length > 0 && <>
            <label className={styles.fieldLabel}>Hub recordings<select value={selected} onChange={(e) => setSelected(e.target.value)}>{files.map((file) => <option key={file.name} value={file.name}>{new Date(Number(file.name.split("-")[0])).toLocaleString()} ({Math.ceil(file.bytes / 1024)} KB)</option>)}</select></label>
            <div className={styles.actions}><button disabled={busy || !selected} onClick={() => void openHubFile()}>Open</button><a href={`/yb/recording?name=${encodeURIComponent(selected)}`} download>Download</a></div>
          </>}
          {replay.error && <p role="alert" className={styles.error}>{replay.error}</p>}
          {replay.recording && <>
            <div className={styles.timeline}><output>{(replay.timeMs / 1000).toFixed(1)} / {(replay.recording.durationMs / 1000).toFixed(1)} s</output><span>{replay.sample?.phase ?? "--"}</span></div>
            <input className={styles.seek} aria-label="Replay position" type="range" min={0} max={replay.recording.durationMs} step={10} value={replay.timeMs} onChange={(e) => replay.seek(Number(e.target.value))} />
            <div className={styles.actions}><button onClick={replay.toggle}>{replay.playing ? "Pause" : "Play"}</button><button onClick={() => replay.seek(replay.recording!.samples[0].timeMs)}>Restart</button><select aria-label="Replay speed" value={replay.speed} onChange={(e) => replay.setSpeed(Number(e.target.value))}>{[0.25, 0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}x</option>)}</select></div>
            {replay.recording.incomplete && <p className={styles.warning}>Incomplete recording</p>}
            {replay.recording.droppedSamples > 0 && <p className={styles.warning}>{replay.recording.droppedSamples} dropped samples</p>}
            {replay.recording.sizeLimitReached && <p className={styles.warning}>Recording size limit reached</p>}
            <h2>Recorded States</h2>
            <dl className={styles.states}>{replay.recording.states.map((name) => <div key={name}><dt>{name}</dt><dd>{replay.sample?.errors[name] ? `Error: ${replay.sample.errors[name]}` : JSON.stringify(replay.sample?.states[name] ?? null)}</dd></div>)}</dl>
          </>}
        </section>}
      </aside>
    </div>
  </main>;
}
