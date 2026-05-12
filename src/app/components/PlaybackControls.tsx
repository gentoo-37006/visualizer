"use client";

import type { CSSProperties } from "react";
import { formatPlaybackTime } from "../playback";
import styles from "../page.module.css";

type PlaybackControlsProps = {
  isRunning: boolean;
  currentTime: number;
  totalTime: number;
  accentColor: string;
  trackBackground: string;
  onToggle: () => void;
  onScrub: (time: number) => void;
};

export function PlaybackControls({
  isRunning,
  currentTime,
  totalTime,
  accentColor,
  trackBackground,
  onToggle,
  onScrub,
}: PlaybackControlsProps) {
  return (
    <section className={styles.playbackSidebar} aria-label="Path playback">
      <div className={styles.playbackRow}>
        <button
          className={styles.playButton}
          onClick={onToggle}
          aria-label={isRunning ? "Pause path playback" : "Play path playback"}
          title={isRunning ? "Pause" : "Play"}
        >
          {isRunning ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14"></rect>
              <rect x="14" y="5" width="4" height="14"></rect>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="8,5 19,12 8,19"></polygon>
            </svg>
          )}
        </button>
        <input
          className={styles.playbackRange}
          type="range"
          min="0"
          max={Math.max(0.001, totalTime || 0)}
          step="0.01"
          value={Math.min(currentTime || 0, Math.max(0.001, totalTime || 0))}
          style={
            {
              "--playback-color": accentColor,
              "--playback-track": trackBackground,
              accentColor,
            } as CSSProperties
          }
          onChange={(event) => onScrub(Number(event.target.value))}
          aria-label="Path playback progress"
        />
        <div className={styles.playbackTime}>
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(totalTime)}
        </div>
      </div>
    </section>
  );
}
