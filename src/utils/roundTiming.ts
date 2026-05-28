import { ROUND_START_COUNTDOWN_MS } from "../constants";

export function getRoundPlayStartAt(roundStartedAt: number): number {
  return roundStartedAt + ROUND_START_COUNTDOWN_MS;
}

export function getRoundCountdownMs(roundStartedAt: number | null, now: number): number {
  if (roundStartedAt === null) {
    return 0;
  }

  return Math.max(0, getRoundPlayStartAt(roundStartedAt) - now);
}

export function getRoundTimeLeftMs(roundStartedAt: number | null, roundDurationSec: number, now: number): number {
  const roundDurationMs = roundDurationSec * 1000;

  if (roundStartedAt === null) {
    return roundDurationMs;
  }

  const elapsedMs = Math.max(0, now - getRoundPlayStartAt(roundStartedAt));
  return Math.max(0, roundDurationMs - elapsedMs);
}

export function getRoundElapsedPlayMs(roundStartedAt: number | null, now: number): number | null {
  if (roundStartedAt === null) {
    return null;
  }

  return Math.max(0, now - getRoundPlayStartAt(roundStartedAt));
}

export function getRoundDeadlineAt(roundStartedAt: number, roundDurationSec: number): number {
  return getRoundPlayStartAt(roundStartedAt) + roundDurationSec * 1000;
}
