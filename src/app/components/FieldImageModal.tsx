"use client";

import Image from "next/image";
import type { ChangeEvent, RefObject } from "react";
import {
  FIELD_IMAGE_PRESETS,
  type CustomFieldImage,
  type FieldImageSelection,
} from "../fieldImages";
import styles from "../page.module.css";

type FieldImageModalProps = {
  isVisible: boolean;
  selection: FieldImageSelection;
  customFieldImage: CustomFieldImage | null;
  uploadError: string | null;
  isUploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFadeOutComplete: () => void;
  onSelectPreset: (preset: typeof FIELD_IMAGE_PRESETS[number]) => void;
  onSelectCustom: () => void;
  onRemoveCustom: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function FieldImageModal({
  isVisible,
  selection,
  customFieldImage,
  uploadError,
  isUploading,
  fileInputRef,
  onClose,
  onFadeOutComplete,
  onSelectPreset,
  onSelectCustom,
  onRemoveCustom,
  onUpload,
}: FieldImageModalProps) {
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
      onDoubleClick={(event) => event.preventDefault()}
    >
      <section
        className={styles.fieldImageModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-image-modal-title"
      >
        <div className={styles.exportModalHeader}>
          <div>
            <h2 id="field-image-modal-title" className={styles.exportModalTitle}>
              Field Image
            </h2>
            <p className={styles.exportModalSubtitle}>Choose a preset or upload a custom image.</p>
          </div>
        </div>
        <div className={styles.fieldImageModalBody}>
          <div className={styles.fieldPresetGrid}>
            {FIELD_IMAGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`${styles.fieldPresetButton} ${selection.kind === "preset" && selection.id === preset.id ? styles.fieldPresetActive : ""}`}
                onClick={() => onSelectPreset(preset)}
              >
                <span className={styles.fieldPresetPreview}>
                  <Image src={preset.src} alt="" fill sizes="8rem" className={styles.fieldPresetImage} />
                </span>
                <span>{preset.name}</span>
              </button>
            ))}
            {customFieldImage && (
              <div className={styles.customFieldPresetSlot}>
                <button
                  className={`${styles.fieldPresetButton} ${selection.kind === "custom" ? styles.fieldPresetActive : ""}`}
                  onClick={onSelectCustom}
                  title={customFieldImage.name}
                >
                  <span className={styles.fieldPresetPreview}>
                    <Image
                      src={customFieldImage.dataUrl}
                      alt=""
                      fill
                      sizes="8rem"
                      unoptimized
                      className={styles.fieldPresetImage}
                    />
                  </span>
                  <span className={styles.customFieldPresetName}>{customFieldImage.name}</span>
                </button>
                <button
                  className={styles.removeCustomFieldButton}
                  onClick={onRemoveCustom}
                  aria-label={`Remove custom field image ${customFieldImage.name}`}
                  title="Remove custom field"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            )}
          </div>
          {uploadError && <p className={styles.fieldImageError}>{uploadError}</p>}
          <input
            ref={fileInputRef}
            className={styles.hiddenFileInput}
            type="file"
            accept="image/*"
            onChange={onUpload}
          />
          <button
            className={styles.uploadFieldButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            {isUploading ? "Processing…" : customFieldImage ? "Replace Custom Field" : "Upload Custom Field"}
          </button>
        </div>
      </section>
    </div>
  );
}
