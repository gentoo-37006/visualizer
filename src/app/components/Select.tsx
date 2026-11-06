"use client";

import { Children, isValidElement, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./PosePicker.module.css";

type Props = {
  children: ReactNode;
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Select({ children, value, onChange, className = "", disabled, "aria-label": label }: Props) {
  const options = Children.toArray(children).filter(isValidElement<{ value: string | number; children: ReactNode }>).map(option => ({ value: String(option.props.value), label: option.props.children }));
  const selected = options.find(option => option.value === String(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [frame, setFrame] = useState({ left: 0, top: 0, width: 200, maxHeight: 360 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const filtered = options.filter(option => Children.toArray(option.label).join("").toLowerCase().includes(query.toLowerCase()));
  useLayoutEffect(() => {
    if (!open) return;
    input.current?.focus();
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 24);
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - 212));
      setFrame({ width, top, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), maxHeight: Math.min(360, window.innerHeight - top - 12) });
    };
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const focusOutside = (event: FocusEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", focusOutside); };
  }, [open]);
  const choose = (next: string) => { onChange(next); setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className={`${className} ${styles.selectTrigger}`} disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setQuery(""); setActive(-1); setOpen(current => !current); }}>{selected?.label ?? "Select"}</button>
    {open && createPortal(<div ref={menu} className={styles.menu} style={frame}>
      <div className={styles.editor}><input ref={input} role="combobox" aria-label={label ? `${label} search` : "Search options"} aria-controls={id} aria-expanded="true" aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} placeholder={typeof selected?.label === "string" ? selected.label : "Search..."} value={query} onChange={event => { setQuery(event.target.value); setActive(-1); }} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(0, Math.min(filtered.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter") { event.preventDefault(); const option = filtered[Math.max(0, active)]; if (option) choose(option.value); }
      }} /></div>
      <div id={id} role="listbox" aria-label={label ?? "Options"} className={styles.options}>{filtered.map((option, index) => <button type="button" id={`${id}-${index}`} key={option.value} role="option" aria-selected={option.value === String(value)} className={active === index ? styles.highlighted : ""} onPointerDown={event => event.preventDefault()} onClick={() => choose(option.value)}><span className={styles.optionContent}>{option.label}</span>{option.value === String(value) && <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}</button>)}{filtered.length === 0 && <span className={styles.empty}>No matches</span>}</div>
    </div>, document.body)}
  </>;
}
