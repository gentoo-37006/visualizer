"use client";

import { useState, type KeyboardEvent } from "react";
import styles from "../page.module.css";
import type { AutonActionMode } from "../plannerTypes";
import { isKotlinIdentifierDraft, isNumericDraft } from "../plannerUtils";

type ActionCardProps = {
  name: string;
  mode: AutonActionMode;
  timeout: number;
  onNameChange: (name: string) => void;
  onModeChange: (mode: AutonActionMode) => void;
  onTimeoutChange: (timeout: string) => void;
  onEditStart: () => void;
  onEditCommit: () => void;
  onDelete: () => void;
};

export function ActionCard({
  name,
  mode,
  timeout,
  onNameChange,
  onModeChange,
  onTimeoutChange,
  onEditStart,
  onEditCommit,
  onDelete,
}: ActionCardProps) {
  const [isEditingTimeout, setIsEditingTimeout] = useState(false);
  const [draftTimeout, setDraftTimeout] = useState("");
  const [timeoutBeforeEdit, setTimeoutBeforeEdit] = useState(0);

  const commitTimeout = (value: string) => {
    const nextTimeout = Number.parseFloat(value);
    if (Number.isFinite(nextTimeout) && nextTimeout !== timeoutBeforeEdit) {
      onTimeoutChange(value);
    }
    onEditCommit();
    setIsEditingTimeout(false);
  };

  const handleTimeoutKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    commitTimeout(event.currentTarget.value);
    event.currentTarget.blur();
  };

  return (
    <div className={`${styles.pointCard} ${styles.actionCard}`}>
      <div className={styles.pointCardHeader}>
        <input
          className={styles.actionNameInput}
          maxLength={24}
          value={name}
          onFocus={() => {
            onEditStart();
          }}
          onChange={(event) => {
            const nextName = event.target.value.toUpperCase();
            if (!isKotlinIdentifierDraft(nextName)) return;
            onNameChange(nextName);
          }}
          onBlur={() => {
            onEditCommit();
          }}
          aria-label="Action name"
        />
        <button
          className={`${styles.iconButton} ${styles.deleteArmed}`}
          onClick={onDelete}
          aria-label="Delete action"
          title="Delete action"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
      <div className={styles.coordRow}>
        <div className={styles.selectGroup}>
          <label className={styles.inputLabel}>Mode</label>
          <select
            className={styles.selectField}
            value={mode}
            onChange={(event) => onModeChange(event.target.value as AutonActionMode)}
          >
            <option value="start">Start</option>
            <option value="run">Run</option>
            <option value="stop">Stop</option>
          </select>
        </div>
        {mode === "run" && (
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Timeout (s)</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.inputField}
              value={isEditingTimeout ? draftTimeout : timeout.toFixed(1)}
              onFocus={() => {
                onEditStart();
                setIsEditingTimeout(true);
                setDraftTimeout(timeout.toFixed(1));
                setTimeoutBeforeEdit(timeout);
              }}
              onChange={(event) => {
                if (!isNumericDraft(event.target.value)) return;
                setDraftTimeout(event.target.value);
                onTimeoutChange(event.target.value);
              }}
              onBlur={(event) => commitTimeout(event.target.value)}
              onKeyDown={handleTimeoutKeyDown}
            />
          </div>
        )}
      </div>
    </div>
  );
}
