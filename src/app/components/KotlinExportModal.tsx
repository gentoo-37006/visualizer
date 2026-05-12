"use client";

import type { RefObject } from "react";
import styles from "../page.module.css";

type KotlinExport = {
  fileName: string;
  subtitle: string;
  contents: string;
};

type KotlinExportModalProps = {
  kotlinExport: KotlinExport;
  didCopyExport: boolean;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  onCopy: () => void;
};

export function KotlinExportModal({
  kotlinExport,
  didCopyExport,
  textAreaRef,
  onClose,
  onCopy,
}: KotlinExportModalProps) {
  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.exportModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className={styles.exportModalHeader}>
          <div>
            <h2 id="export-modal-title" className={styles.exportModalTitle}>
              {kotlinExport.fileName}
            </h2>
            <p className={styles.exportModalSubtitle}>{kotlinExport.subtitle}</p>
          </div>
          <button
            className={styles.secondaryIconButton}
            onClick={onClose}
            aria-label="Close export modal"
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <textarea
          ref={textAreaRef}
          className={styles.exportCode}
          value={kotlinExport.contents}
          readOnly
          spellCheck={false}
          aria-label="Generated Kotlin class file contents"
        />

        <div className={styles.exportModalActions}>
          <span className={styles.copyStatus} aria-live="polite">
            {didCopyExport ? "Copied" : "Select or copy the class text"}
          </span>
          <button className={styles.copyButton} onClick={onCopy}>
            Copy
          </button>
        </div>
      </section>
    </div>
  );
}
