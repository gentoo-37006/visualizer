"use client";

import { Select } from "../app/components/Select";

import { useEffect, useRef, useState } from "react";
import { FieldViewport } from "../field/FieldViewport";
import { RobotLayer } from "../field/RobotLayer";
import { TrailLayer } from "../field/TrailLayer";
import { PathLayer } from "../field/PathLayer";
import { followedFieldPaths } from "./followedPaths";
import { PlaybackControls } from "../app/components/PlaybackControls";
import { RecordingSidebar } from "../app/components/RecordingSidebar";
import { RefreshIcon } from "../app/components/RefreshIcon";
import { FieldImageModal } from "../app/components/FieldImageModal";
import { FIELD_BORDER_WIDTH, POINT_RADIUS } from "../app/plannerConstants";
import { usePoseFeed } from "./usePoseFeed";
import { useReplay } from "./useReplay";
import { usePlaybackShortcut } from "../app/hooks/usePlaybackShortcut";
import { useHubRecordings } from "./useHubRecordings";
import { hubRecordingTimestamp } from "./hubRecordings";
import { useFieldImage } from "./useFieldImage";
import styles from "../app/page.module.css";
import tracker from "./tracker.module.css";

export function TrackerApp({ assetBase = "", endpoint = "/visualizer/pose", preview = false }: { assetBase?: string; endpoint?: string; preview?: boolean }) {
  const field = useFieldImage(assetBase);
  const [showTrail, setShowTrail] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
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
  const hub = useHubRecordings(replay.load, replay.setError, replay.pause, !preview, mode === "replay");
  usePlaybackShortcut(mode === "replay" && !hub.busy ? replay.toggle : undefined);
  const pose = mode === "live" ? live.snapshot?.pose : replay.pose;
  const robot = mode === "live" ? live.snapshot?.robot : replay.recording?.robot;
  const trail = mode === "live" ? live.trail : replay.trail;
  const livePath = live.snapshot?.active ? live.snapshot.path : null;
  const paths = mode === "live" ? (livePath ? [livePath] : []) : replay.paths;
  const stale = mode === "live" && (live.status === "Stale" || live.status === "Disconnected" || live.ageMs === null || live.ageMs > 1000);
  const viewport = { ...fieldSize, padding: POINT_RADIUS, border: FIELD_BORDER_WIDTH };
  function changeMode(next: "live" | "replay") {
    if (next === "live") replay.pause();
    setMode(next);
  }
  const sourceControl = <div className={`${styles.importExportActions} ${tracker.sourceControl}`} aria-busy={hub.busy}>
    <Select className={tracker.recordingSelect} aria-label="Hub recording" value={hub.selected} onChange={(value) => hub.select(value)} disabled={hub.files.length === 0}>
      {hub.files.length === 0 && <option value="">{hub.busy ? "Loading..." : "No recordings"}</option>}
      {hub.files.map((file) => <option key={file.name} value={file.name}>{new Date(hubRecordingTimestamp(file.name)).toLocaleString()} ({Math.ceil(file.bytes / 1024)} KB)</option>)}
    </Select>
    <button className={styles.secondaryIconButton} disabled={preview || hub.busy} onClick={() => void hub.refresh()} aria-label="Refresh Hub recordings" title="Refresh recordings">
      <RefreshIcon />
    </button>
    {hub.selected ? <a className={styles.secondaryIconButton} href={`/visualizer/recording?name=${encodeURIComponent(hub.selected)}`} download aria-label="Download recording" title="Download recording">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
    </a> : <button className={styles.secondaryIconButton} disabled aria-label="Download recording" title="Download recording">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
    </button>}
    {hub.busy && <span className={tracker.loading} role="status">Loading recording...</span>}
  </div>;

  return <main className={`${styles.container} ${tracker.container}`}>
    <div className={styles.workspace}>
    <div className={styles.fieldWrapper}>
      <FieldViewport image={field.src} width={fieldSize.width} height={fieldSize.height} padding={POINT_RADIUS} containerRef={fieldRef} className={styles.fieldContainer} imageClassName={styles.fieldImage} overlayClassName={styles.svgOverlay} overlayProps={{
        role: "button", tabIndex: 0, "aria-label": "Change field image",
        onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); field.show(); } },
        onClick: (event) => {
          if (event.target !== event.currentTarget) return;
          if (lastFieldClick.current !== null && event.timeStamp - lastFieldClick.current <= 500) {
            lastFieldClick.current = null; event.preventDefault(); field.show();
          } else lastFieldClick.current = event.timeStamp;
        },
      }}>
        {fieldSize.width > 0 && <>
          {showPaths && <PathLayer paths={followedFieldPaths(paths)} viewport={viewport} showEndpoints />}
          {showTrail && <TrailLayer poses={trail} viewport={viewport} />}
          {pose && robot && <g opacity={stale ? 0.4 : 1}><RobotLayer pose={pose} size={robot} viewport={viewport} image={`${assetBase}/robot.png`} /></g>}
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
            </div>
          </header>
          <div className={`${styles.pointsList} ${styles.recordingContent}`}>
            <div className={styles.recordingMeta}><strong>{live.snapshot?.opMode ?? "No active opmode"}</strong></div>
            <section className={styles.recordingSection} aria-label="Live auton path">
              <h3>Auton Path</h3>
              <dl className={styles.recordingReadouts}>
                <div><dt>Active path</dt><dd>{livePath?.id ?? "--"}</dd></div>
                <div><dt>Path progress</dt><dd>{livePath ? `${((live.snapshot?.pathT ?? 0) * 100).toFixed(1)}%` : "--"}</dd></div>
                <div><dt>Pose age</dt><dd>{live.ageMs === null ? "--" : `${Math.round(live.ageMs)} ms`}</dd></div>
              </dl>
            </section>
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
              <label className={styles.recordingTrailToggle}><input type="checkbox" checked={showPaths} onChange={(event) => setShowPaths(event.target.checked)} />Followed paths</label>
            </div>
            <button className={styles.recordingRestartButton} onClick={live.clearTrail} disabled={trail.length === 0}>Clear Trail</button>
          </div>
        </aside> : <>
          <RecordingSidebar replay={replay} showTrail={showTrail} onShowTrailChange={setShowTrail} showPaths={showPaths} onShowPathsChange={setShowPaths} sourceControl={sourceControl} />
        </>}
      </div>
    </div>
    </div>
    {mode === "live" ? <section className={`${styles.bottomBar} ${tracker.connectionBar}`} aria-label="Robot connection">
      <span role="status" className={tracker.status} data-live={!preview && live.status === "Live"}>{preview ? "No data" : live.status}</span>
      <span className={tracker.connectionOpMode} title={live.snapshot?.opMode ?? undefined}>{live.snapshot?.opMode ?? "No active opmode"}</span>
      <span className={tracker.connectionAge}>{live.ageMs === null ? "--" : `${Math.round(live.ageMs)} ms`}</span>
    </section> : <PlaybackControls mode="recording" disabled={hub.busy || !replay.recording || replay.recording.durationMs <= replay.recording.samples[0].timeMs} isRunning={replay.playing} currentTime={replay.timeMs / 1000} totalTime={(replay.recording?.durationMs ?? 0) / 1000} accentColor="#2dd4bf" trackBackground="var(--border)" onToggle={replay.toggle} onScrub={(time) => replay.seek(time * 1000)} />}
    {field.open && <FieldImageModal isVisible selection={field.selection} customFieldImage={field.custom} uploadError={field.error} isUploading={field.uploading} fileInputRef={field.fileInput} onClose={field.close} onFadeOutComplete={field.close} onSelectPreset={(preset) => field.apply({ kind: "preset", id: preset.id })} onSelectCustom={() => field.apply({ kind: "custom" })} onRemoveCustom={field.remove} onUpload={field.upload} assetBase={assetBase} />}
  </main>;
}
