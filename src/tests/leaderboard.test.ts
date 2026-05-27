import { describe, expect, it } from "vitest";
import type { RoomState } from "../types";
import { buildLeaderboard } from "../utils/leaderboard";

const room: RoomState = {
  code: "ABC123",
  name: "리더보드 방",
  hostId: "host",
  seed: "seed",
  createdAt: 0,
  phase: "finished",
  settings: {
    roundCount: 3,
    leaderboardMode: "sum",
    roundDurationSec: 120
  },
  access: {
    password: null,
    isPublic: true
  },
  currentRoundIndex: 2,
  roundStartedAt: 0,
  submissions: {
    "0": {
      host: { score: 3, finishedAt: 1, clearTimeMs: null },
      guest: { score: 9, finishedAt: 2, clearTimeMs: 18400 }
    },
    "1": {
      host: { score: 4, finishedAt: 3, clearTimeMs: 52600 }
    },
    "2": {
      host: { score: 5, finishedAt: 4, clearTimeMs: 70400 }
    }
  },
  players: {
    host: {
      id: "host",
      nickname: "Host",
      joinedAt: 1,
      isHost: true,
      roundScores: { "0": 3, "1": 4, "2": 5 }
    },
    guest: {
      id: "guest",
      nickname: "Guest",
      joinedAt: 2,
      isHost: false,
      roundScores: { "0": 9, "1": 0, "2": 0 }
    }
  }
};

describe("buildLeaderboard", () => {
  it("sorts by sum mode", () => {
    const leaderboard = buildLeaderboard(room);
    expect(leaderboard[0].nickname).toBe("Host");
    expect(leaderboard[0].finalScore).toBe(12);
    expect(leaderboard[0].clearTimes).toEqual([null, 52600, 70400]);
  });

  it("sorts by best mode", () => {
    const leaderboard = buildLeaderboard({
      ...room,
      settings: {
        ...room.settings,
        leaderboardMode: "best"
      }
    });

    expect(leaderboard[0].nickname).toBe("Guest");
    expect(leaderboard[0].finalScore).toBe(9);
  });
});
