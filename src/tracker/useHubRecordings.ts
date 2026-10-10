import { useCallback, useEffect, useRef, useState } from "react";
import { listHubRecordings, readHubRecording, type HubRecording } from "./hubRecordings";

export function useHubRecordings(load: (text: string) => boolean, setError: (error: string | null) => void, pause: () => void) {
  const [files, setFiles] = useState<HubRecording[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(true);
  const callbacks = useRef({ load, setError, pause });
  const selection = useRef("");
  const listRequest = useRef<AbortController | null>(null);
  const fileRequest = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useEffect(() => { callbacks.current = { load, setError, pause }; }, [load, setError, pause]);

  const open = useCallback(async (file: HubRecording) => {
    fileRequest.current?.abort();
    const controller = new AbortController();
    fileRequest.current = controller;
    selection.current = file.name;
    setSelected(file.name); setBusy(true);
    callbacks.current.pause(); callbacks.current.setError(null);
    try {
      const text = await readHubRecording(file, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (!controller.signal.aborted && alive.current) callbacks.current.load(text);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) callbacks.current.setError(error instanceof Error ? error.message : "Could not load Hub recording");
    } finally {
      if (!controller.signal.aborted && alive.current) setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setBusy(true); callbacks.current.setError(null);
    try {
      const next = await listHubRecordings(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
      if (controller.signal.aborted || !alive.current) return;
      setFiles(next);
      const file = next.find((item) => item.name === selection.current) ?? next[0];
      if (file) await open(file);
      else { selection.current = ""; setSelected(""); setBusy(false); }
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        callbacks.current.setError(error instanceof Error ? error.message : "Could not list Hub recordings");
        setBusy(false);
      }
    }
  }, [open]);

  useEffect(() => {
    alive.current = true;
    // Fetch once per page load, independently of the active tab.
    void Promise.resolve().then(() => { if (alive.current) void refresh(); });
    return () => { alive.current = false; listRequest.current?.abort(); fileRequest.current?.abort(); };
  }, [refresh]);
  return { files, selected, busy, refresh, select: (name: string) => {
    const file = files.find((item) => item.name === name);
    if (file) void open(file);
  } };
}
