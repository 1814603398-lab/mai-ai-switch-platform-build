import type { StoredSession } from "./types";

const SESSION_KEY = "cc-switch-secdev.session";
const ENDPOINT_KEY = "cc-switch-secdev.endpoint";

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadEndpoint(): string {
  return localStorage.getItem(ENDPOINT_KEY) ?? "";
}

export function saveEndpoint(endpoint: string): void {
  localStorage.setItem(ENDPOINT_KEY, endpoint);
}
