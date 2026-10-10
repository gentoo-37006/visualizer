"use client";

import { useRef, useState } from "react";
import type { useReplay } from "../../tracker/useReplay";
import { readRecordingFile } from "../../tracker/replay";
import styles from "../page.module.css";

type Props = {
  replay: ReturnType<typeof useReplay>;
  showTrail: boolean;
  onShowTrailChange: (show: boolean) => void;
};

export function RecordingSidebar({ replay, showTrail, onShowTrailChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const recording = replay.recording;
  async function importFile(file?: File) {
    if (!file) return;
    setIsLoading(true);
    try {
      replay.load(await readRecordingFile(file));
    } catch (error) {
      replay.setError(error instanceof Error ? error.message : "Could not read recording");
    } finally {
      setIsLoading(false);
    }
  }

  return <aside className={styles.sidebar} aria-label="Flashback">
    <header className={styles.sidebarHeader}>
      <div className={styles.sidebarTitleRow}>
        <h2 className={styles.sidebarTitle}>Flashback</h2>
        <button className={`${styles.secondaryIconButton} ${styles.recordingImportButton}`} disabled={isLoading} onClick={() => input.current?.click()}>{isLoading ? "Loading..." : "Open Recording"}</button>
      </div>
      <input ref={input} aria-label="Import recording" type="file" accept=".jsonl,.ndjson" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        void importFile(file);
      }} />
    </header>
    <div className={`${styles.pointsList} ${styles.recordingContent}`}>
      {replay.error && <p role="alert" className={styles.recordingError}>{replay.error}</p>}
      {!recording ? <div className={styles.emptyState}>No recording selected</div> : <>
        <div className={styles.recordingMeta}>
          <strong>{recording.opMode}</strong>
          <span>{replay.sample?.phase ?? "--"}</span>
        </div>
        <section className={styles.recordingSection} aria-label="Recorded robot position">
          <h3>Robot Position</h3>
          <dl className={styles.recordingReadouts}>
            <div><dt>X (in)</dt><dd>{replay.pose?.x.toFixed(1) ?? "--"}</dd></div>
            <div><dt>Y (in)</dt><dd>{replay.pose?.y.toFixed(1) ?? "--"}</dd></div>
            <div><dt>Heading (deg)</dt><dd>{replay.pose?.heading.toFixed(1) ?? "--"}</dd></div>
            <div><dt>Width (in)</dt><dd>{recording.robot.width.toFixed(2)}</dd></div>
            <div><dt>Length (in)</dt><dd>{recording.robot.length.toFixed(2)}</dd></div>
          </dl>
        </section>
        <div className={styles.recordingOptions}>
          <label>Speed<select aria-label="Recording speed" value={replay.speed} onChange={(event) => replay.setSpeed(Number(event.target.value))}>{[0.25, 0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
          <label className={styles.recordingTrailToggle}><input type="checkbox" checked={showTrail} onChange={(event) => onShowTrailChange(event.target.checked)} />Movement trail</label>
        </div>
        <button className={styles.recordingRestartButton} onClick={() => replay.seek(recording.samples[0].timeMs)}>Restart Recording</button>
        {recording.incomplete && <p className={styles.recordingWarning}>Incomplete recording</p>}
        {recording.droppedSamples > 0 && <p className={styles.recordingWarning}>{recording.droppedSamples} dropped samples</p>}
        {recording.sizeLimitReached && <p className={styles.recordingWarning}>Recording size limit reached</p>}
        <section className={styles.recordingSection} aria-label="Recorded states">
          <h3>Recorded States</h3>
          <dl className={styles.recordingStates}>{recording.states.map((name) => <div key={name}>
            <dt>{name}</dt>
            <dd>{replay.sample?.errors[name] ? <span className={styles.recordingError}>Error: {replay.sample.errors[name]}</span> : <pre>{JSON.stringify(replay.sample?.states[name] ?? null, null, 2)}</pre>}</dd>
          </div>)}</dl>
        </section>
      </>}
    </div>
  </aside>;
}
