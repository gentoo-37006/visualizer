"use client";

import { useRef, type RefObject } from "react";
import styles from "../page.module.css";
import { KotlinSyntaxHighlight } from "./KotlinSyntaxHighlight";

type KotlinExport = {
  contents: string;
};

type KotlinExportModalProps = {
  title?: string;
  isVisible: boolean;
  kotlinExport: KotlinExport;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  onFadeOutComplete: () => void;
  onCopy: () => void;
};

export function KotlinExportModal({
  title = "Exported Path",
  isVisible,
  kotlinExport,
  textAreaRef,
  onClose,
  onFadeOutComplete,
  onCopy,
}: KotlinExportModalProps) {
  const syntaxHighlightRef = useRef<HTMLPreElement>(null);

  return (
    <div
      className={`${styles.modalBackdrop} ${styles.fadeModalBackdrop} ${isVisible ? styles.fadeModalOpen : styles.fadeModalClosing}`}
      role="presentation"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !isVisible) onFadeOutComplete();
      }}
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
          <h2 id="export-modal-title" className={styles.exportModalTitle}>
            {title}
          </h2>
          <button
            className={styles.copyButton}
            onClick={onCopy}
            aria-label="Copy generated Kotlin"
            title="Copy"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2"></rect>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
            </svg>
          </button>
        </div>

        <div className={styles.exportCodeShell}>
          <pre ref={syntaxHighlightRef} className={styles.exportCodeHighlight} aria-hidden="true">
            <code><KotlinSyntaxHighlight contents={kotlinExport.contents} /></code>
          </pre>
          <textarea
            ref={textAreaRef}
            className={styles.exportCode}
            value={kotlinExport.contents}
            readOnly
            spellCheck={false}
            aria-label="Generated Kotlin class file contents"
            onScroll={(event) => {
              if (!syntaxHighlightRef.current) return;
              syntaxHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
              syntaxHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
          />
        </div>

      </section>
    </div>
  );
}
