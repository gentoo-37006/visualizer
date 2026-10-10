import { MAX_RECORDING_BYTES } from "./replay";

export type HubRecording = { name: string; bytes: number };
export async function listHubRecordings(signal: AbortSignal): Promise<HubRecording[]> {
  const response = await fetch("/visualizer/recordings", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not list Hub recordings");
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every((file) => typeof file?.name === "string" && /^\d+-[a-f\d-]+\.jsonl$/i.test(file.name) && Number.isSafeInteger(file.bytes) && file.bytes >= 0))
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
