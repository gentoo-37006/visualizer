import { useCallback, useEffect, useRef, useState } from "react";
import { listHubRecordings, readHubRecording, type HubRecording } from "./hubRecordings";

export function useHubRecordings(load: (text: string, preservePlayback?: boolean) => boolean, setError: (error: string | null) => void, pause: () => void, enabled = true, autoRefresh = true) {
  const [files, setFiles] = useState<HubRecording[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(enabled);
  const callbacks = useRef({ load, setError, pause });
  const selection = useRef("");
  const loaded = useRef<HubRecording | null>(null);
  const listFailed = useRef(false);
  const listRequest = useRef<AbortController | null>(null);
  const fileRequest = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useEffect(() => { callbacks.current = { load, setError, pause }; }, [load, setError, pause]);

  const open = useCallback(async (file: HubRecording, background = false) => {
    if (!enabled) return;
    fileRequest.current?.abort();
    const controller = new AbortController();
    fileRequest.current = controller;
    selection.current = file.name;
    setSelected(file.name);
    const preservePlayback = loaded.current?.name === file.name;
    if (!background || !loaded.current) setBusy(true);
    if (!preservePlayback) callbacks.current.pause();
    if (!background) callbacks.current.setError(null);
    try {
      const text = await readHubRecording(file, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (!controller.signal.aborted && alive.current && callbacks.current.load(text, preservePlayback)) loaded.current = file;
    } catch (error) {
      if (!controller.signal.aborted && alive.current && !background) callbacks.current.setError(error instanceof Error ? error.message : "Could not load Hub recording");
    } finally {
      if (fileRequest.current === controller) {
        fileRequest.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }, [enabled]);

  const refresh = useCallback(async (background = false) => {
    if (!enabled) return;
    if (background && (listRequest.current || fileRequest.current)) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    if (!background) { setBusy(true); callbacks.current.setError(null); }
    try {
      const next = await listHubRecordings(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
      if (controller.signal.aborted || !alive.current) return;
      setFiles(next);
      if (listFailed.current) { listFailed.current = false; callbacks.current.setError(null); }
      const file = next.find((item) => item.name === selection.current) ?? next[0];
      if (file) {
        if (!fileRequest.current && (!background || loaded.current?.name !== file.name || loaded.current.bytes !== file.bytes)) await open(file, background);
      } else { selection.current = ""; setSelected(""); setBusy(false); }
    } catch (error) {
      if (!controller.signal.aborted && alive.current && !background) {
        listFailed.current = true;
        callbacks.current.setError(error instanceof Error ? error.message : "Could not list Hub recordings");
        setBusy(false);
      }
    } finally {
      if (listRequest.current === controller) {
        listRequest.current = null;
        if (alive.current && !fileRequest.current) setBusy(false);
      }
    }
  }, [enabled, open]);

  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    // Fetch once per page load, independently of the active tab.
    void Promise.resolve().then(() => { if (alive.current) void refresh(); });
    return () => { alive.current = false; listRequest.current?.abort(); fileRequest.current?.abort(); };
  }, [enabled, refresh]);
  useEffect(() => {
    if (!enabled || !autoRefresh) return;
    const check = () => {
      // A local Hub can be reachable even when the browser reports no internet.
      if (document.visibilityState === "visible") void refresh(true);
    };
    check();
    const timer = window.setInterval(check, 5000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [autoRefresh, enabled, refresh]);
  return { files, selected, busy: enabled && busy, refresh, select: (name: string) => {
    const file = files.find((item) => item.name === name);
    if (file) void open(file);
  } };
}
