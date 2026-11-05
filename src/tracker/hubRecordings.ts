import { MAX_RECORDING_BYTES } from "./replay";

export type HubRecording = { name: string; bytes: number };
const recordingName = /^(?:\d+|\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-[a-f\d-]+\.jsonl$/i;

export function hubRecordingTimestamp(name: string): number {
  if (!recordingName.test(name)) return Number.NaN;
  if (!name.includes("T")) return Number(name.split("-")[0]);
  return Date.parse(name.slice(0, 24).replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3"));
}
export async function listHubRecordings(signal: AbortSignal): Promise<HubRecording[]> {
  const response = await fetch("/visualizer/recordings", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not list Hub recordings");
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every((file) => typeof file?.name === "string" && recordingName.test(file.name) && Number.isFinite(hubRecordingTimestamp(file.name)) && Number.isSafeInteger(file.bytes) && file.bytes >= 0))
    throw new Error("Invalid Hub recording list");
  return data;
}
export async function readHubRecording(file: HubRecording, signal: AbortSignal): Promise<string> {
  if (file.bytes > MAX_RECORDING_BYTES) throw new Error("Recording exceeds 32 MB");
  const response = await fetch(`/visualizer/recording?name=${encodeURIComponent(file.name)}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not load Hub recording");
  const text = await response.text();
  if (text.length > MAX_RECORDING_BYTES) throw new Error("Recording exceeds 32 MB");
  return text;
}
