import { describe, expect, it } from "vitest";
import type { RoomState } from "../types";
import { buildLeaderboard, buildTeamLeaderboard } from "../utils/leaderboard";

function createTeamRoom(): RoomState {
  return {
    code: "ROOM12",
    name: "팀전 테스트",
    hostId: "host",
    seed: "ROOM12-seed",
    createdAt: 1000,
    phase: "finished",
    settings: {
      roundCount: 3,
      leaderboardMode: "sum",
      roundDurationSec: 120,
      gameMode: "team",
      teamMode: "individual",
      teamCount: 2
    },
    access: {
      password: null,
      isPublic: true
    },
    currentRoundIndex: 2,
    roundStartedAt: null,
    teams: [
      { id: "team-1", name: "1팀" },
      { id: "team-2", name: "2팀" }
    ],
    sharedTeamBoards: {},
    teamPointers: {},
    liveScores: {},
    players: {
      host: {
        id: "host",
        nickname: "Host",
        joinedAt: 1000,
        isHost: true,
        connected: true,
        lastSeenAt: 1000,
        roundScores: { "0": 5, "1": 7, "2": 3 },
        teamId: "team-1"
      },
      guest: {
        id: "guest",
        nickname: "Guest",
        joinedAt: 1100,
        isHost: false,
        connected: true,
        lastSeenAt: 1100,
        roundScores: { "0": 4, "1": 5, "2": 4 },
        teamId: "team-1"
      },
      third: {
        id: "third",
        nickname: "Third",
        joinedAt: 1200,
        isHost: false,
        connected: true,
        lastSeenAt: 1200,
        roundScores: { "0": 8, "1": 4, "2": 2 },
        teamId: "team-2"
      }
    },
    submissions: {
      "0": {},
      "1": {},
      "2": {}
    },
    nextRoundVotes: {},
    chatMessages: []
  };
}

describe("leaderboard", () => {
  it("includes team ids in the player leaderboard", () => {
    const room = createTeamRoom();
    const leaderboard = buildLeaderboard(room);

    expect(leaderboard[0].teamId).toBeDefined();
    expect(leaderboard.map((entry) => entry.teamId)).toContain("team-1");
  });

  it("aggregates player scores into a team leaderboard", () => {
    const room = createTeamRoom();
    const teamLeaderboard = buildTeamLeaderboard(room);

    expect(teamLeaderboard).toHaveLength(2);
    expect(teamLeaderboard[0]).toMatchObject({
      id: "team-1",
      finalScore: 28,
      roundScores: [9, 12, 7]
    });
    expect(teamLeaderboard[1]).toMatchObject({
      id: "team-2",
      finalScore: 14,
      roundScores: [8, 4, 2]
    });
  });

  it("uses shared-board scores once per team in shared mode", () => {
    const room: RoomState = {
      ...createTeamRoom(),
      settings: {
        ...createTeamRoom().settings,
        teamMode: "shared"
      },
      sharedTeamBoards: {
        "0": {
          "team-1": {
            teamId: "team-1",
            removedAppleIds: ["a"],
            score: 6,
            clearTimeMs: null,
            submittedAt: 10
          },
          "team-2": {
            teamId: "team-2",
            removedAppleIds: ["b"],
            score: 4,
            clearTimeMs: null,
            submittedAt: 10
          }
        },
        "1": {
          "team-1": {
            teamId: "team-1",
            removedAppleIds: ["c"],
            score: 8,
            clearTimeMs: null,
            submittedAt: 20
          },
          "team-2": {
            teamId: "team-2",
            removedAppleIds: ["d"],
            score: 3,
            clearTimeMs: null,
            submittedAt: 20
          }
        },
        "2": {
          "team-1": {
            teamId: "team-1",
            removedAppleIds: ["e"],
            score: 5,
            clearTimeMs: null,
            submittedAt: 30
          },
          "team-2": {
            teamId: "team-2",
            removedAppleIds: ["f"],
            score: 2,
            clearTimeMs: null,
            submittedAt: 30
          }
        }
      }
    };

    const teamLeaderboard = buildTeamLeaderboard(room);

    expect(teamLeaderboard[0]).toMatchObject({
      id: "team-1",
      finalScore: 19,
      roundScores: [6, 8, 5]
    });
    expect(teamLeaderboard[1]).toMatchObject({
      id: "team-2",
      finalScore: 9,
      roundScores: [4, 3, 2]
    });
  });
});
