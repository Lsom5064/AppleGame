import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerState } from "../types";
import { isPlayerConnected } from "../utils/presence";
import { setRealtimeClockOffset } from "../utils/realtimeClock";

const player: PlayerState = {
  id: "guest",
  nickname: "Guest",
  joinedAt: 0,
  isHost: false,
  connected: true,
  lastSeenAt: 60000,
  roundScores: {},
  teamId: "team-1"
};

describe("presence", () => {
  afterEach(() => {
    setRealtimeClockOffset(0);
    vi.useRealTimers();
  });

  it("uses the realtime clock offset when checking server-aligned heartbeats", () => {
    vi.useFakeTimers();
    vi.setSystemTime(120000);

    expect(isPlayerConnected(player)).toBe(false);

    setRealtimeClockOffset(-60000);

    expect(isPlayerConnected(player)).toBe(true);
  });
});
