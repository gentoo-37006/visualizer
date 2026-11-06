"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./ServiceWorkerRegistration.module.css";

export function ServiceWorkerRegistration() {
  const isPreview = usePathname() === "/onboard-preview";
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const dismissed = useRef<ServiceWorker | null>(null);
  const refreshRequested = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isPreview || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    let hadController = !!navigator.serviceWorker.controller;
    const offerUpdate = (worker: ServiceWorker | null) => {
      if (!disposed && worker && worker !== dismissed.current) setUpdate(worker);
    };
    const onInstalled = () => {
      if (installing?.state === "installed" && navigator.serviceWorker.controller) offerUpdate(installing);
    };
    const onUpdateFound = () => {
      installing?.removeEventListener("statechange", onInstalled);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", onInstalled);
    };
    const check = () => {
      if (registration && navigator.onLine && document.visibilityState === "visible") {
        offerUpdate(registration.waiting);
        void registration.update().catch(() => {});
      }
    };
    const onControllerChange = () => {
      if (refreshRequested.current) window.location.reload();
      else if (hadController) offerUpdate(navigator.serviceWorker.controller);
      hadController = true;
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(value => {
      if (disposed) return;
      registration = value;
      registration.addEventListener("updatefound", onUpdateFound);
      onUpdateFound();
      offerUpdate(registration.waiting);
      check();
    }).catch(() => {});
    const interval = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      registration?.removeEventListener("updatefound", onUpdateFound);
      installing?.removeEventListener("statechange", onInstalled);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [isPreview]);

  useEffect(() => {
    if (update && !dialog.current?.open) dialog.current?.showModal();
  }, [update]);

  function dismiss() {
    dismissed.current = update;
    setUpdate(null);
  }

  function refresh() {
    if (!update) return;
    setRefreshing(true);
    refreshRequested.current = true;
    if (update === navigator.serviceWorker.controller || update.state === "activated") window.location.reload();
    else update.postMessage({ type: "ACTIVATE_UPDATE" });
  }

  return !isPreview && update && <dialog ref={dialog} className={styles.dialog} aria-labelledby="app-update-title" aria-describedby="app-update-description" onCancel={event => {
    event.preventDefault();
    if (!refreshing) dismiss();
  }}>
    <h2 id="app-update-title">Update Available</h2>
    <p id="app-update-description">A newer version of Online Visualizer is ready. Refresh to load it.</p>
    <div className={styles.actions}>
      <button disabled={refreshing} onClick={dismiss}>Later</button>
      <button disabled={refreshing} className={styles.refresh} onClick={refresh}>{refreshing ? "Refreshing..." : "Refresh"}</button>
    </div>
  </dialog>;
}
