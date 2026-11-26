import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const origin = "https://visualizer.test";

function worker(version = "one", stores = new Map<string, Map<string, Response>>()) {
  const handlers = new Map<string, (event: unknown) => void>();
  const key = (request: string | { url: string }) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (request: string | { url: string }) => store.get(key(request))?.clone(),
      put: async (request: string | { url: string }, response: Response) => { store.set(key(request), response.clone()); },
      delete: async (request: string | { url: string }) => store.delete(key(request)),
      keys: async () => [...store.keys()].map(url => ({ url })),
    };
  };
  const fetch = vi.fn(async (request: string | { url: string }) => {
    const pathname = new URL(key(request)).pathname;
    return new Response(["/", "/onboard-preview", "/visualizer"].includes(pathname)
      ? `<html>${version}:${pathname}<link href="/_next/static/style.css"/><script src="/_next/static/app.js"></script></html>` : `${version}:${pathname}`);
  });
  const skipWaiting = vi.fn(async () => {});
  const claim = vi.fn(async () => {});
  runInNewContext(source.replace("__BUILD_VERSION__", version), {
    URL, Response, fetch,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (request: string | { url: string }) => {
        for (const name of stores.keys()) {
          const response = await (await open(name)).match(request);
          if (response) return response;
        }
      },
    },
    self: { location: { origin }, skipWaiting, clients: { claim }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) },
  });
  async function dispatch(name: string, data = {}) {
    const tasks: Promise<unknown>[] = [];
    handlers.get(name)!({ ...data, waitUntil: (task: Promise<unknown>) => tasks.push(task) });
    await Promise.all(tasks);
  }
  async function request(path: string, mode = "navigate") {
    let response: Promise<Response> | undefined;
    const tasks: Promise<unknown>[] = [];
    handlers.get("fetch")!({
      request: { url: new URL(path, origin).href, method: "GET", mode },
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
    });
    const result = await response;
    await Promise.all(tasks);
    return result;
  }
  return { dispatch, request, fetch, stores, skipWaiting, claim };
}

describe("versioned offline worker", () => {
  it("prepares each route, CSS, scripts, and public images before becoming ready", async () => {
    const app = worker();
    await app.dispatch("install");
    const urls = [...app.stores.get("online-visualizer-one")!.keys()];
    for (const route of ["/", "/visualizer", "/_next/static/style.css", "/_next/static/app.js", "/fields/biobuzz.webp", "/robot.png"]) {
      expect(urls).toContain(origin + route);
    }
    expect(app.skipWaiting).not.toHaveBeenCalled();
  });

  it("serves cached pages and stable assets without waiting for the network", async () => {
    const app = worker();
    await app.dispatch("install");
    app.fetch.mockClear();
    expect(await (await app.request("/"))?.text()).toContain("one:/");
    expect(await (await app.request("/visualizer?test=true"))?.text()).toContain("one:/visualizer");
    expect(await (await app.request("/robot.png", "cors"))?.text()).toBe("one:/robot.png");
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("stages a new deployment without overwriting the active offline version", async () => {
    const old = worker();
    await old.dispatch("install");
    const update = worker("two", old.stores);
    await update.dispatch("install");
    expect(await (await old.request("/"))?.text()).toContain("one:/");
    expect(await (await update.request("/"))?.text()).toContain("two:/");
    expect(update.skipWaiting).not.toHaveBeenCalled();
    await update.dispatch("message", { data: { type: "ACTIVATE_UPDATE" } });
    expect(update.skipWaiting).toHaveBeenCalledOnce();
  });

  it("does not offer an incomplete update when an asset fails to download", async () => {
    const old = worker();
    await old.dispatch("install");
    const update = worker("two", old.stores);
    update.fetch.mockImplementation(async () => new Response("Failed", { status: 503 }));
    await expect(update.dispatch("install")).rejects.toThrow("Could not cache");
    expect(old.stores.has("online-visualizer-two")).toBe(false);
    expect(await (await old.request("/"))?.text()).toContain("one:/");
  });

  it("never caches robot APIs or unrelated routes", async () => {
    const app = worker();
    for (const route of ["/onboard-preview", "/onboard-preview/", "/onboard-preview?test=true", "/visualizer/recordings", "/visualizer/recording?name=123-a.jsonl", "/not-a-page"]) {
      expect(await app.request(route)).toBeUndefined();
    }
    expect(await app.request("/visualizer/", "cors")).toBeUndefined();
    expect(await app.request("/?_rsc=123", "cors")).toBeUndefined();
    expect(await app.request("/_next/static/chunks/app/onboard-preview/page-hash.js", "cors")).toBeUndefined();
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("retains the prior build for open tabs and leaves unrelated caches alone", async () => {
    const app = worker();
    await app.dispatch("install");
    await worker("two", app.stores).dispatch("install");
    const latest = worker("three", app.stores);
    await latest.dispatch("install");
    app.stores.set("other-app", new Map());
    await latest.dispatch("activate");
    expect([...app.stores.keys()]).toEqual(["online-visualizer-two", "online-visualizer-three", "other-app", "visualizer-cache-state"]);
    expect(latest.claim).toHaveBeenCalledOnce();
  });

  it("keeps the actual preceding active version, not a superseded waiting update", async () => {
    const app = worker();
    await app.dispatch("install");
    await app.dispatch("activate");
    await worker("two", app.stores).dispatch("install");
    const latest = worker("three", app.stores);
    await latest.dispatch("install");
    await latest.dispatch("activate");
    expect(app.stores.has("online-visualizer-one")).toBe(true);
    expect(app.stores.has("online-visualizer-two")).toBe(false);
  });

  it("removes preview pages cached by previous versions", async () => {
    const app = worker();
    app.stores.set("auton-visualizer-v8", new Map([[origin + "/onboard-preview", new Response("Old preview")]]));
    await app.dispatch("install");
    await app.dispatch("activate");
    for (const store of app.stores.values()) expect(store.has(origin + "/onboard-preview")).toBe(false);
  });
});
