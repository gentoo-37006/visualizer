import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { clearCustomFieldImage, createCustomFieldImage, DEFAULT_FIELD_IMAGE_SELECTION, loadCustomFieldImage, loadFieldImageSelection, resolveFieldImageSrc, saveCustomFieldImage, saveFieldImageSelection, type CustomFieldImage, type FieldImageSelection } from "../app/fieldImages";

export function useFieldImage(assetBase: string) {
  const [selection, setSelection] = useState<FieldImageSelection>(DEFAULT_FIELD_IMAGE_SELECTION);
  const [custom, setCustom] = useState<CustomFieldImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<Element | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const image = loadCustomFieldImage(), saved = loadFieldImageSelection();
        setCustom(image); setSelection(saved.kind === "custom" && !image ? DEFAULT_FIELD_IMAGE_SELECTION : saved);
      } catch { /* Storage may be unavailable in a private browser session. */ }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!open) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const buttons = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="file"])') ?? []);
    buttons()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "Tab") {
        const items = buttons(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (trigger.current instanceof HTMLElement || trigger.current instanceof SVGElement) trigger.current.focus(); };
  }, [open]);
  function apply(next: FieldImageSelection) {
    setSelection(next); setError(null);
    try { saveFieldImageSelection(next); } catch { setError("Could not save field selection"); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const image = await createCustomFieldImage(file);
      saveCustomFieldImage(image); setCustom(image); apply({ kind: "custom" });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load field image"); }
    finally { setUploading(false); }
  }
  const source = resolveFieldImageSrc(selection, custom);
  return { selection, custom, error, uploading, open, fileInput, upload, apply,
    src: source.startsWith("/") ? `${assetBase}${source}` : source,
    show: () => { trigger.current = document.activeElement; setOpen(true); }, close: () => setOpen(false),
    remove: () => {
      try { clearCustomFieldImage(); setCustom(null); setError(null); if (selection.kind === "custom") apply(DEFAULT_FIELD_IMAGE_SELECTION); }
      catch { setError("Could not remove custom field image"); }
    } };
}
