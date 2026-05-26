import { describe, expect, it } from "vitest";
import type { RoomState } from "../types";
import {
  createInitialRoom,
  forceRoomProgress,
  joinRoom,
  leaveRoom,
  normalizeRoomState,
  startRoomGame,
  submitRoundScore,
  updateRoomSettings
} from "../utils/roomMutations";

function createStartedRoom(): RoomState {
  const created = createInitialRoom("ROOM12", "host", "Host", 1000);
  const joined = joinRoom(created, "guest", "Guest", 1500);
  const configured = updateRoomSettings(joined, "host", {
    roundCount: 3
  });
  return startRoomGame(configured, "host", 2000);
}

describe("roomMutations", () => {
  it("allows only the host to change lobby settings", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000);

    expect(
      updateRoomSettings(room, "host", {
        roundCount: 5,
        leaderboardMode: "best"
      }).settings
    ).toMatchObject({
      roundCount: 5,
      leaderboardMode: "best"
    });

    expect(() =>
      updateRoomSettings(room, "guest", {
        roundCount: 1
      })
    ).toThrow("방장만 설정을 변경할 수 있습니다.");
  });

  it("advances to the next round after every player submits", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const afterGuest = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);

    expect(afterGuest.phase).toBe("playing");
    expect(afterGuest.currentRoundIndex).toBe(1);
    expect(afterGuest.players.host.roundScores["0"]).toBe(6);
    expect(afterGuest.players.guest.roundScores["0"]).toBe(4);
    expect(afterGuest.roundStartedAt).toBe(3500);
    expect(afterGuest.submissions["0"].host.clearTimeMs).toBe(11000);
  });

  it("fills missing submissions with zero after timeout and finishes the last round", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", {
      roundCount: 1
    });
    const started = startRoomGame(configured, "host", 2000);
    const afterHost = submitRoundScore(started, "host", 0, 8, null, 2100);
    const resolved = forceRoomProgress(afterHost, 2000 + started.settings.roundDurationSec * 1000 + 2000);

    expect(resolved.phase).toBe("finished");
    expect(resolved.players.host.roundScores["0"]).toBe(8);
    expect(resolved.players.guest.roundScores["0"]).toBe(0);
    expect(resolved.submissions["0"].guest.score).toBe(0);
    expect(resolved.submissions["0"].guest.clearTimeMs).toBeNull();
  });

  it("transfers host ownership to the earliest remaining player when the host leaves", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const withThird = joinRoom(withGuest, "third", "Third", 1700);
    const afterLeave = leaveRoom(withThird, "host");

    expect(afterLeave).not.toBeNull();
    expect(afterLeave?.hostId).toBe("guest");
    expect(afterLeave?.players.guest.isHost).toBe(true);
    expect(afterLeave?.players.third.isHost).toBe(false);
  });

  it("handles sparse room data from Firebase when a second player joins", () => {
    const sparseRoom = {
      code: "ROOM12",
      hostId: "host",
      seed: "ROOM12-1000",
      createdAt: 1000,
      phase: "lobby",
      settings: {
        roundCount: 3,
        leaderboardMode: "sum",
        roundDurationSec: 120
      },
      currentRoundIndex: 0,
      roundStartedAt: null,
      players: {
        host: {
          id: "host",
          nickname: "Host",
          joinedAt: 1000,
          isHost: true
        }
      }
    } as unknown as RoomState;

    const normalized = normalizeRoomState(sparseRoom);
    const joined = joinRoom(normalized, "guest", "Guest", 1500);

    expect(joined.players.host.roundScores).toEqual({});
    expect(joined.players.guest.roundScores).toEqual({});
    expect(joined.submissions).toEqual({});
  });
});
