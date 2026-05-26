import { describe, expect, it } from "vitest";
import type { RoomState } from "../types";
import { buildLeaderboard } from "../utils/leaderboard";

const room: RoomState = {
  code: "ABC123",
  hostId: "host",
  seed: "seed",
  createdAt: 0,
  phase: "finished",
  settings: {
    roundCount: 3,
    leaderboardMode: "sum",
    roundDurationSec: 120
  },
  currentRoundIndex: 2,
  roundStartedAt: 0,
  submissions: {},
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
