"use client";

import type { CSSProperties } from "react";
import { AUTONOMOUS_PERIOD_SECONDS, formatPlaybackTime, getAutonomousOvertime, type PlaybackActionMarker } from "../playback";
import styles from "../page.module.css";

type PlaybackControlsProps = {
  isRunning: boolean;
  currentTime: number;
  totalTime: number;
  accentColor: string;
  trackBackground: string;
  onToggle: () => void;
  onScrub: (time: number) => void;
  mode?: "path" | "recording";
  disabled?: boolean;
  actionMarkers?: PlaybackActionMarker[];
};

export function PlaybackControls({
  isRunning,
  currentTime,
  totalTime,
  accentColor,
  trackBackground,
  onToggle,
  onScrub,
  mode = "path",
  disabled = false,
  actionMarkers = [],
}: PlaybackControlsProps) {
  const overtime = getAutonomousOvertime(totalTime);
  const isOverBudget = mode === "path" && overtime > 0;
  const playbackLabel = mode === "path" ? "Path playback" : "Recording playback";
  const isDisabled = disabled || !Number.isFinite(totalTime) || totalTime <= 0;
  const progress = totalTime > 0 ? Math.max(0, Math.min(1, currentTime / totalTime)) : 0;
  const progressStop = `${progress * 100}%`;
  const markerColor = isDisabled ? "#707070" : mode === "recording" ? "#ffffff" : `color-mix(in srgb, ${accentColor} 75%, #ffffff 25%)`;
  const background = isDisabled ? "#4b4b4b" : mode === "recording"
    ? `linear-gradient(to right, #ffffff 0%, #ffffff ${progressStop}, var(--border) ${progressStop}, var(--border) 100%)`
    : trackBackground;

  return (
    <section className={`${styles.bottomBar} ${isDisabled ? styles.playbackDisabled : ""}`} aria-label={playbackLabel}>
      <div className={styles.playbackRow}>
        <button
          className={styles.playButton}
          onClick={onToggle}
          aria-label={`${isRunning ? "Pause" : "Play"} ${playbackLabel.toLowerCase()}`}
          disabled={isDisabled}
          title={isRunning ? "Pause" : "Play"}
        >
          {isRunning ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14"></rect>
              <rect x="14" y="5" width="4" height="14"></rect>
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="8,5 19,12 8,19"></polygon>
            </svg>
          )}
        </button>
        <div className={styles.playbackTrack} style={{
          "--playback-color": markerColor,
          "--playback-track": background,
        } as CSSProperties}>
        {isOverBudget && !isDisabled && <div className={styles.playbackTrackOverlay} aria-hidden="true">
          <span className={styles.playbackOvertimeHatch} style={{ left: `${AUTONOMOUS_PERIOD_SECONDS / totalTime * 100}%` }} />
        </div>}
        <input
          className={styles.playbackRange}
          type="range"
          min="0"
          max={Math.max(0.001, totalTime || 0)}
          step="0.01"
          value={Math.min(currentTime || 0, Math.max(0.001, totalTime || 0))}
          onChange={(event) => onScrub(Number(event.target.value))}
          aria-label={`${playbackLabel} progress`}
          disabled={isDisabled}
        />
        {mode === "path" && totalTime > 0 && <div className={styles.playbackMarkers}>
          {actionMarkers.map((marker) => <button
            key={marker.id}
            className={styles.playbackActionMarker}
            style={{ left: `${Math.max(0, Math.min(100, marker.time / totalTime * 100))}%` }}
            title={`${marker.label} at ${formatPlaybackTime(marker.time)}`}
            aria-label={`Seek to ${marker.label}`}
            disabled={isDisabled}
            onClick={() => onScrub(marker.time)}
          />)}
        </div>}
        </div>
        <div
          className={`${styles.playbackTime} ${isOverBudget ? styles.playbackTimeOverBudget : ""}`}
          title={
            isOverBudget
              ? `${overtime.toFixed(1)}s over the ${AUTONOMOUS_PERIOD_SECONDS}s autonomous period`
              : undefined
          }
        >
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(totalTime)}
          {isOverBudget && (
            <span className={styles.playbackOvertime}>+{overtime.toFixed(1)}s</span>
          )}
        </div>
      </div>
    </section>
  );
}
