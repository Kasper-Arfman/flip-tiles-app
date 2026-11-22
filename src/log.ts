// A small log on the device: the last errors and important events (the store, purchases, saved
// data that was converted), to find out what went wrong on a phone. Nothing leaves the device:
// the debug screen shows the log and can copy it, to send by hand.
//
// It is saved (with Preferences, like the progress), so it still holds what happened before the
// app was closed or crashed.
import { Preferences } from "@capacitor/preferences";

export interface LogEntry {
  time: number; // ms since 1970
  level: "info" | "warn" | "error";
  message: string;
}

const KEY = "log-v1";
const KEEP = 200; // the newest entries kept
let entries: LogEntry[] = [];
let saving: ReturnType<typeof setTimeout> | undefined;

export function log(level: LogEntry["level"], message: string) {
  entries.push({ time: Date.now(), level, message: message.slice(0, 1000) });
  if (entries.length > KEEP) entries = entries.slice(-KEEP);
  (level === "info" ? console.info : level === "warn" ? console.warn : console.error)(message);
  // Saved a moment later, once for a burst of entries
  if (saving === undefined) {
    saving = setTimeout(() => {
      saving = undefined;
      void Preferences.set({ key: KEY, value: JSON.stringify(entries) }).catch(() => {});
    }, 500);
  }
}

export function clearLog() {
  entries = [];
  void Preferences.remove({ key: KEY });
}

// At the start: the saved log back, and every error that nothing else catches into it
export async function startLog() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    const saved: LogEntry[] = value ? JSON.parse(value) : [];
    entries = [...saved, ...entries].slice(-KEEP);
  } catch {
    // (an unreadable log is dropped)
  }
  window.addEventListener("error", (e) => log("error", `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ""}` : String(e.reason);
    log("error", `Unhandled: ${reason}`);
  });
}

// The log as text, newest last
export const logText = () =>
  entries.map((e) => `${new Date(e.time).toISOString()} ${e.level.toUpperCase()} ${e.message}`).join("\n");
