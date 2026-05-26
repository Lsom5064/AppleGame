import { createSeededRandom } from "./random";

const CLIENT_ID_KEY = "apple-sum-client-id";

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
