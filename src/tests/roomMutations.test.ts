import { describe, expect, it } from "vitest";
import type { RoomState } from "../types";
import {
  addRoomChatMessage,
  createInitialRoom,
  forceRoomProgress,
  joinRoom,
  leaveRoom,
  normalizeRoomState,
  startNextRound,
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
  it("stores the room access options when a host creates a room", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000, {
      name: "  사과방  ",
      password: " 1234 ",
      isPublic: false
    });

    expect(room.name).toBe("사과방");
    expect(room.access).toEqual({
      password: "1234",
      isPublic: false
    });
  });

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

  it("requires the correct password when joining a locked room", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000, {
      name: "잠금방",
      password: "apple",
      isPublic: true
    });

    expect(() => joinRoom(room, "guest", "Guest", 1500, "wrong")).toThrow("비밀번호가 올바르지 않습니다.");
    expect(joinRoom(room, "guest", "Guest", 1500, "apple").players.guest.nickname).toBe("Guest");
  });

  it("adds chat messages for players in the room", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const withMessage = addRoomChatMessage(joined, "guest", "  안녕하세요  ", 2000);

    expect(withMessage.chatMessages).toEqual([
      {
        id: "guest:2000:0",
        playerId: "guest",
        nickname: "Guest",
        text: "안녕하세요",
        createdAt: 2000
      }
    ]);
  });

  it("waits for the host to start the next round after every player submits", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const afterGuest = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);

    expect(afterGuest.phase).toBe("between-rounds");
    expect(afterGuest.currentRoundIndex).toBe(0);
    expect(afterGuest.players.host.roundScores["0"]).toBe(6);
    expect(afterGuest.players.guest.roundScores["0"]).toBe(4);
    expect(afterGuest.roundStartedAt).toBeNull();
    expect(afterGuest.submissions["0"].host.clearTimeMs).toBe(11000);
  });

  it("starts the next round only when the host requests it", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const waiting = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);
    const nextRound = startNextRound(waiting, "host", 5000);

    expect(nextRound.phase).toBe("playing");
    expect(nextRound.currentRoundIndex).toBe(1);
    expect(nextRound.roundStartedAt).toBe(5000);
  });

  it("completes a 3-round game in the expected pause and resume order", () => {
    const started = createStartedRoom();

    const afterRoundOne = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const waitingForRoundTwo = submitRoundScore(afterRoundOne, "guest", 0, 4, null, 3500);
    expect(waitingForRoundTwo.phase).toBe("between-rounds");
    expect(waitingForRoundTwo.currentRoundIndex).toBe(0);

    const roundTwo = startNextRound(waitingForRoundTwo, "host", 5000);
    expect(roundTwo.phase).toBe("playing");
    expect(roundTwo.currentRoundIndex).toBe(1);

    const afterRoundTwo = submitRoundScore(roundTwo, "host", 1, 9, 9000, 7000);
    const waitingForRoundThree = submitRoundScore(afterRoundTwo, "guest", 1, 1, null, 7100);
    expect(waitingForRoundThree.phase).toBe("between-rounds");
    expect(waitingForRoundThree.currentRoundIndex).toBe(1);

    const roundThree = startNextRound(waitingForRoundThree, "host", 9000);
    expect(roundThree.phase).toBe("playing");
    expect(roundThree.currentRoundIndex).toBe(2);

    const afterRoundThree = submitRoundScore(roundThree, "host", 2, 5, null, 12000);
    const finished = submitRoundScore(afterRoundThree, "guest", 2, 3, null, 12100);
    expect(finished.phase).toBe("finished");
    expect(finished.players.host.roundScores).toEqual({ "0": 6, "1": 9, "2": 5 });
    expect(finished.players.guest.roundScores).toEqual({ "0": 4, "1": 1, "2": 3 });
  });

  it("normalizes legacy paused rooms into between-rounds state", () => {
    const started = createStartedRoom();
    const legacyPausedRoom = {
      ...started,
      phase: "playing" as const,
      currentRoundIndex: 1,
      roundStartedAt: null
    };

    expect(normalizeRoomState(legacyPausedRoom).phase).toBe("between-rounds");
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

  it("allows the host to restart a finished game", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", {
      roundCount: 1
    });
    const started = startRoomGame(configured, "host", 2000);
    const finished = submitRoundScore(started, "host", 0, 8, null, 2100);
    const restarted = startRoomGame(forceRoomProgress(finished, 2000 + started.settings.roundDurationSec * 1000 + 2000), "host", 9000);

    expect(restarted.phase).toBe("playing");
    expect(restarted.currentRoundIndex).toBe(0);
    expect(restarted.roundStartedAt).toBe(9000);
    expect(restarted.submissions).toEqual({});
    expect(restarted.players.host.roundScores).toEqual({});
    expect(restarted.players.guest.roundScores).toEqual({});
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

    expect(normalized.access).toEqual({
      password: null,
      isPublic: true
    });
    expect(normalized.chatMessages).toEqual([]);
    expect(joined.players.host.roundScores).toEqual({});
    expect(joined.players.guest.roundScores).toEqual({});
    expect(joined.submissions).toEqual({});
  });

  it("falls back to a host-based room name when no room name is provided", () => {
    const room = normalizeRoomState(
      {
        ...createInitialRoom("ROOM12", "host", "Host", 1000),
        name: ""
      } as RoomState
    );

    expect(room.name).toBe("Host님의 방");
  });
});
