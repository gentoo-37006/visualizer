"use client";

import { useEffect, useRef, useState } from "react";
import { FieldViewport } from "../field/FieldViewport";
import { RobotLayer } from "../field/RobotLayer";
import { TrailLayer } from "../field/TrailLayer";
import { PlaybackControls } from "../app/components/PlaybackControls";
import { RecordingSidebar } from "../app/components/RecordingSidebar";
import { FieldImageModal } from "../app/components/FieldImageModal";
import { FIELD_BORDER_WIDTH, POINT_RADIUS } from "../app/plannerConstants";
import { usePoseFeed } from "./usePoseFeed";
import { useReplay } from "./useReplay";
import { useHubRecordings } from "./useHubRecordings";
import { hubRecordingTimestamp } from "./hubRecordings";
import { useFieldImage } from "./useFieldImage";
import styles from "../app/page.module.css";
import tracker from "./tracker.module.css";

export function TrackerApp({ assetBase = "", endpoint = "/visualizer/pose", preview = false }: { assetBase?: string; endpoint?: string; preview?: boolean }) {
  const field = useFieldImage(assetBase);
  const [showTrail, setShowTrail] = useState(true);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"live" | "replay">("live");
  const lastFieldClick = useRef<number | null>(null);
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
  const live = usePoseFeed(endpoint, preview || paused || mode === "replay");
  const replay = useReplay(mode === "replay");
  const hub = useHubRecordings(replay.load, replay.setError, replay.pause, !preview);
  const pose = mode === "live" ? live.snapshot?.pose : replay.pose;
  const robot = mode === "live" ? live.snapshot?.robot : replay.recording?.robot;
  const trail = mode === "live" ? live.trail : replay.trail;
  const viewport = { ...fieldSize, padding: POINT_RADIUS, border: FIELD_BORDER_WIDTH };
  function changeMode(next: "live" | "replay") {
    if (next === "live") replay.pause();
    setMode(next);
  }
  const sourceControl = <div className={tracker.sourceControl}>
    <label className={tracker.selectLabel}>Hub Recording<select aria-label="Hub recording" value={hub.selected} onChange={(event) => hub.select(event.target.value)} disabled={hub.files.length === 0}>
      {hub.files.length === 0 && <option value="">{hub.busy ? "Loading..." : "No recordings"}</option>}
      {hub.files.map((file) => <option key={file.name} value={file.name}>{new Date(hubRecordingTimestamp(file.name)).toLocaleString()} ({Math.ceil(file.bytes / 1024)} KB)</option>)}
    </select></label>
    <div className={tracker.actions}>
      <button className={`${styles.secondaryIconButton} ${styles.recordingImportButton}`} disabled={preview || hub.busy} onClick={() => void hub.refresh()}>Refresh Hub</button>
      {hub.selected && <a className={`${styles.secondaryIconButton} ${styles.recordingImportButton}`} href={`/visualizer/recording?name=${encodeURIComponent(hub.selected)}`} download>Download</a>}
    </div>
    {hub.busy && <span className={tracker.loading} role="status">Loading recording...</span>}
  </div>;

  return <main className={`${styles.container} ${tracker.container}`}>
    <div className={`${styles.fieldWrapper} ${tracker.fieldWrapper}`}>
      <FieldViewport image={field.src} width={fieldSize.width} height={fieldSize.height} padding={POINT_RADIUS} containerRef={fieldRef} className={styles.fieldContainer} imageClassName={styles.fieldImage} overlayClassName={styles.svgOverlay} overlayProps={{
        role: "button", tabIndex: 0, "aria-label": "Change field image",
        onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); field.show(); } },
        onClick: (event) => {
          if (event.target !== event.currentTarget) return;
          if (lastFieldClick.current !== null && event.timeStamp - lastFieldClick.current <= 500) {
            lastFieldClick.current = null; event.preventDefault(); field.show();
          } else lastFieldClick.current = event.timeStamp;
        },
      }}>
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
              <span role="status" className={tracker.status} data-live={!preview && live.status === "Live"}>{preview ? "No data" : live.status}</span>
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
            <div className={styles.recordingOptions}>
              <label className={styles.recordingTrailToggle}><input type="checkbox" disabled={preview} checked={!preview && !paused} onChange={(event) => setPaused(!event.target.checked)} />Live updates</label>
              <label className={styles.recordingTrailToggle}><input type="checkbox" checked={showTrail} onChange={(event) => setShowTrail(event.target.checked)} />Movement trail</label>
            </div>
            <button className={styles.recordingRestartButton} onClick={live.clearTrail} disabled={trail.length === 0}>Clear Trail</button>
          </div>
        </aside> : <>
          <RecordingSidebar replay={replay} showTrail={showTrail} onShowTrailChange={setShowTrail} sourceControl={sourceControl} />
          <PlaybackControls mode="recording" disabled={hub.busy || !replay.recording || replay.recording.durationMs <= replay.recording.samples[0].timeMs} isRunning={replay.playing} currentTime={replay.timeMs / 1000} totalTime={(replay.recording?.durationMs ?? 0) / 1000} accentColor="#2dd4bf" trackBackground="var(--border)" onToggle={replay.toggle} onScrub={(time) => replay.seek(time * 1000)} />
        </>}
      </div>
    </div>
    {field.open && <FieldImageModal isVisible selection={field.selection} customFieldImage={field.custom} uploadError={field.error} isUploading={field.uploading} fileInputRef={field.fileInput} onClose={field.close} onFadeOutComplete={field.close} onSelectPreset={(preset) => field.apply({ kind: "preset", id: preset.id })} onSelectCustom={() => field.apply({ kind: "custom" })} onRemoveCustom={field.remove} onUpload={field.upload} assetBase={assetBase} />}
  </main>;
}
