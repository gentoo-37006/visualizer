import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHubRecordingTimestamp, hubRecordingTimestamp, listHubRecordings, readHubRecording } from "./hubRecordings";
import { MAX_RECORDING_BYTES } from "./replay";

const file = { name: "1234-abcdef.jsonl", bytes: 100 };
const signal = new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());
describe("Hub recording transport", () => {
  it("formats UTC and legacy timestamps in the browser timezone with a zone label", () => {
    const name = "2026-11-05T14-30-12.123Z-abcdef.jsonl";
    const expected = new Date("2026-11-05T14:30:12.123Z").toLocaleString(undefined, { timeZoneName: "short" });
    expect(formatHubRecordingTimestamp(name)).toBe(expected);
    expect(formatHubRecordingTimestamp(`${Date.parse("2026-11-05T14:30:12.123Z")}-abcdef.jsonl`)).toBe(expected);
  });
  it("accepts current UTC recording names alongside legacy epoch names", async () => {
    const current = { name: "2026-11-05T14-30-12.123Z-abcdef.jsonl", bytes: 100 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([current, file]))));
    expect(await listHubRecordings(signal)).toEqual([current, file]);
    expect(hubRecordingTimestamp(current.name)).toBe(Date.parse("2026-11-05T14:30:12.123Z"));
    expect(hubRecordingTimestamp(file.name)).toBe(1234);
    expect(hubRecordingTimestamp("../secret")).toBeNaN();
  });
  it("fetches fresh lists with cancellation", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([file])));
    vi.stubGlobal("fetch", fetch);
    expect(await listHubRecordings(signal)).toEqual([file]);
    expect(fetch).toHaveBeenCalledWith("/visualizer/recordings", { cache: "no-store", signal });
  });
  it("accepts an empty Hub", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    expect(await listHubRecordings(signal)).toEqual([]);
  });
  it.each([{ name: "../secret", bytes: 100 }, { ...file, bytes: -1 }, { ...file, bytes: 0.5 }])("rejects invalid file metadata", async (bad) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([bad]))));
    await expect(listHubRecordings(signal)).rejects.toThrow("Invalid Hub recording list");
  });
  it("loads the selected file without caching", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("recording data"));
    vi.stubGlobal("fetch", fetch);
    expect(await readHubRecording(file, signal)).toBe("recording data");
    expect(fetch).toHaveBeenCalledWith(`/visualizer/recording?name=${file.name}`, { cache: "no-store", signal });
  });
  it("rejects oversized files before downloading", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(readHubRecording({ ...file, bytes: MAX_RECORDING_BYTES + 1 }, signal)).rejects.toThrow("32 MB");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports failed list and download requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(listHubRecordings(signal)).rejects.toThrow("Could not list");
    await expect(readHubRecording(file, signal)).rejects.toThrow("Could not load");
  });
});
