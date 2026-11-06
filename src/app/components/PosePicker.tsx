"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findSavedPose, savedPoseVariable, type SavedPose } from "../kotlinAutonFile";
import styles from "./PosePicker.module.css";
import { isNumericDraft } from "../plannerUtils";

export type PoseSelection = { x: number; y: number; heading?: number; poseName?: string };

export function parsePoseCoordinates(text: string, includeHeading = false): PoseSelection | null {
  const values = text.trim().replace(/^\(/, "").replace(/\)$/, "").split(/\s*,\s*|\s+/);
  if (values.length !== (includeHeading ? 3 : 2) || values.some(value => !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value))) return null;
  const [x, y, heading] = values.map(Number);
  return values.every(value => Number.isFinite(Number(value))) ? { x, y, ...(includeHeading ? { heading } : {}) } : null;
}

export function PoseDetails({ pose }: { pose: SavedPose }) {
  if (!pose.start) return null;
  const sideways = pose.start.facing === "EAST" || pose.start.facing === "WEST";
  const alignment = (axis: "horizontal" | "vertical") => {
    const coordinate = pose.start![axis];
    const dimension = axis === "horizontal" ? (sideways ? "length" : "width") : (sideways ? "width" : "length");
    return <><span>{coordinate.reference?.replaceAll("_", " ") ?? `${coordinate.value.toFixed(1)} in`}</span><span>{coordinate.offset === 0 ? "No offset" : `${coordinate.offset > 0 ? "+" : "−"} ½ ${dimension}`}</span></>;
  };
  return <dl className={styles.details}><dt>X alignment</dt><dd>{alignment("horizontal")}</dd><dt>Y alignment</dt><dd>{alignment("vertical")}</dd><dt>Facing</dt><dd>{pose.start.facing}</dd></dl>;
}

export function PosePicker({ x, y, heading, poseName, savedPoses, label, onChange }: PoseSelection & {
  savedPoses: SavedPose[]; label: string; onChange: (pose: PoseSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ x: "", y: "", heading: "" });
  const [position, setPosition] = useState({ left: 0, top: 0, width: 224, maxHeight: 360 });
  const [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const id = useId();
  const selected = poseName ? findSavedPose(savedPoses, poseName) : undefined;
  const coordinates = [x, y, ...(heading === undefined ? [] : [heading])];
  const options = savedPoses;
  const commit = useCallback(() => {
    const value = parsePoseCoordinates([draft.x, draft.y, ...(heading === undefined ? [] : [draft.heading])].join(","), heading !== undefined);
    if (dirty.current && value) onChange(value);
    dirty.current = false;
    setOpen(false);
  }, [draft, heading, onChange]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) commit();
    };
    const focusOutside = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) commit();
    };
    const reposition = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(rect.width, window.innerWidth - 24);
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - 212));
      setPosition({ width, maxHeight: Math.min(360, window.innerHeight - top - 12), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top });
    };
    reposition();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", focusOutside); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, commit]);
  const choose = (pose: SavedPose) => {
    dirty.current = false;
    onChange({ x: pose.x, y: pose.y, ...(heading === undefined ? {} : { heading: pose.heading }), poseName: savedPoseVariable(pose) });
    setOpen(false);
    trigger.current?.focus();
  };
  return <div className={styles.root}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      if (open) { commit(); return; }
      setDraft({ x: x.toFixed(1), y: y.toFixed(1), heading: (heading ?? 0).toFixed(1) }); dirty.current = false; setActive(-1); setOpen(true);
    }}><span>{selected ? <strong>{savedPoseVariable(selected)}</strong> : <span className={styles.inlinePose}>
      <span className={styles.separator}>(</span>
      {coordinates.map((value, index) => <span key={index} className={styles.coordinateCell}>
        {index > 0 && <span className={styles.separator}>,</span>}
        <span className={styles.coordinateValue}>{value.toFixed(1)}</span>
        {index === 2 && <span className={styles.separator}>°</span>}
      </span>)}
      <span className={styles.separator}>)</span>
    </span>}</span></button>
    {selected && <PoseDetails pose={selected} />}
    {open && createPortal(<div ref={panel} role="dialog" aria-label={`${label} options`} className={styles.menu} style={position}>
      <div className={styles.coordinateEditor}>
        <span className={styles.separator} aria-hidden="true">(</span>
        {(["x", "y", ...(heading === undefined ? [] : ["heading"])] as const).map((axis, index) => <label key={axis} className={styles.coordinateCell}>
          {index > 0 && <span className={styles.separator} aria-hidden="true">,</span>}
          <span className={styles.numberField}>
          <span className={styles.numberMeasure} aria-hidden="true">{draft[axis as keyof typeof draft] || "0"}</span>
          <input ref={index === 0 ? input : undefined} aria-label={`${label} ${axis}`} inputMode="decimal" value={draft[axis as keyof typeof draft]} onChange={event => {
            if (!isNumericDraft(event.target.value)) return;
            setDraft(current => ({ ...current, [axis]: event.target.value })); dirty.current = true; setActive(-1);
          }} onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); dirty.current = false; setOpen(false); trigger.current?.focus(); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
            if (event.key === "Enter") { event.preventDefault(); if (active >= 0 && options[active]) choose(options[active]); else commit(); }
          }} />
          </span>
          {axis === "heading" && <span className={styles.separator} aria-hidden="true">°</span>}
        </label>)}
        <span className={styles.separator} aria-hidden="true">)</span>
      </div>
      <div id={id} role="listbox" aria-label="Saved poses" className={styles.options}>{options.map((pose, index) => <button id={`${id}-${index}`} type="button" role="option" aria-selected={selected === pose} className={active === index ? styles.highlighted : ""} key={savedPoseVariable(pose)} onPointerDown={event => event.preventDefault()} onClick={() => choose(pose)}><span className={styles.optionContent}><strong>{savedPoseVariable(pose)}</strong><span>{pose.x.toFixed(1)}, {pose.y.toFixed(1)}, {pose.heading.toFixed(1)}°</span></span>{selected === pose && <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}</button>)}{options.length === 0 && <span className={styles.empty}>No saved poses</span>}</div>
    </div>, document.body)}
  </div>;
}
