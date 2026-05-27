import { createSeededRandom } from "./random";
import type { SessionState } from "../types";

const CLIENT_ID_KEY = "apple-sum-client-id";
const ROOM_SESSION_KEY = "apple-sum-room-session";

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return "server-client";
  }

  const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);

  if (existing) {
    return existing;
  }

  const nextId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : createFallbackClientId();

  window.sessionStorage.setItem(CLIENT_ID_KEY, nextId);

  return nextId;
}

export function loadStoredSession(): SessionState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(ROOM_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionState>;

    if (typeof parsed.roomCode !== "string" || typeof parsed.playerId !== "string") {
      return null;
    }

    return {
      roomCode: parsed.roomCode,
      playerId: parsed.playerId
    };
  } catch {
    return null;
  }
}

export function storeSession(session: SessionState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ROOM_SESSION_KEY);
}

function createFallbackClientId(): string {
  const random = createSeededRandom(
    `${Date.now()}:${typeof window.performance !== "undefined" ? window.performance.now() : 0}`
  );

  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";

  for (let index = 0; index < 10; index += 1) {
    suffix += alphabet[Math.floor(random() * alphabet.length)];
  }

  return `client-${suffix}`;
}
