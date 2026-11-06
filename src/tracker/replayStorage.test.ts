import { afterEach, expect, it, vi } from "vitest";
import { readCachedReplay, saveCachedReplay } from "./replayStorage";

afterEach(() => vi.unstubAllGlobals());

function database(result?: unknown) {
  const request = { result };
  const store = { get: vi.fn(() => request), put: vi.fn(() => request) };
  const transaction = { objectStore: () => store, error: null as Error | null, oncomplete: null as (() => void) | null, onabort: null as (() => void) | null };
  const db = { transaction: vi.fn(() => transaction), close: vi.fn() };
  vi.stubGlobal("indexedDB", { open: () => {
    const openRequest = { result: db, onsuccess: null as (() => void) | null };
    queueMicrotask(() => openRequest.onsuccess?.());
    return openRequest;
  } });
  return { transaction, store, db };
}

it("reads the last uploaded replay after the read transaction completes", async () => {
  const mock = database("recording text");
  const read = readCachedReplay();
  await vi.waitFor(() => expect(mock.store.get).toHaveBeenCalledWith("latest-upload"));
  mock.transaction.oncomplete!();
  expect(await read).toBe("recording text");
  expect(mock.db.close).toHaveBeenCalledOnce();
});

it("waits for the write commit before reporting that the upload is saved", async () => {
  const mock = database();
  let saved = false;
  const write = saveCachedReplay("large recording").then(() => { saved = true; });
  await vi.waitFor(() => expect(mock.store.put).toHaveBeenCalledWith("large recording", "latest-upload"));
  expect(saved).toBe(false);
  mock.transaction.oncomplete!();
  await write;
  expect(saved).toBe(true);
  expect(mock.db.close).toHaveBeenCalledOnce();
});

it("reports an aborted write rather than pretending persistence succeeded", async () => {
  const mock = database();
  const write = saveCachedReplay("recording");
  const failure = expect(write).rejects.toThrow("quota");
  await vi.waitFor(() => expect(mock.store.put).toHaveBeenCalled());
  mock.transaction.error = new Error("quota exceeded");
  mock.transaction.onabort!();
  await failure;
  expect(mock.db.close).toHaveBeenCalledOnce();
});
