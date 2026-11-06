const DATABASE = "auton-visualizer-replays";
const STORE = "recordings";
const KEY = "latest-upload";

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

async function accessRecording(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Replay storage transaction failed"));
      transaction.onerror = () => reject(transaction.error ?? request.error);
    });
  } finally {
    db.close();
  }
}

export async function readCachedReplay(): Promise<string | null> {
  const value = await accessRecording("readonly", store => store.get(KEY));
  return typeof value === "string" ? value : null;
}

export async function saveCachedReplay(text: string): Promise<void> {
  await accessRecording("readwrite", store => store.put(text, KEY));
}
