import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen } from "../components/GameScreen";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import type { PlayerState, RoomState } from "../types";
import { generateApples } from "../utils/gameBoard";

const player: PlayerState = {
  id: "host",
  nickname: "Host",
  joinedAt: 1000,
  isHost: true,
  connected: true,
  lastSeenAt: 1000,
  roundScores: { "0": 7 },
  teamId: null
};

function createRoom(overrides: Partial<RoomState>): RoomState {
  return {
    code: "ROOM12",
    name: "테스트 방",
    hostId: "host",
    seed: "ROOM12-seed",
    createdAt: 1000,
    phase: "playing",
    settings: {
      roundCount: 3,
      leaderboardMode: "sum",
      roundDurationSec: 1,
      gameMode: "solo",
      teamMode: "individual",
      teamCount: 2
    },
    access: {
      password: null,
      isPublic: true
    },
    chatMessages: [],
    nextRoundVotes: {},
    currentRoundIndex: 0,
    roundStartedAt: 1000,
    players: {
      host: {
        ...player,
        roundScores: { ...player.roundScores }
      }
    },
    teams: [
      { id: "team-1", name: "1팀" },
      { id: "team-2", name: "2팀" }
    ],
    sharedTeamBoards: {},
    teamPointers: {},
    submissions: {
      "0": {
        host: {
          score: 7,
          finishedAt: 2000,
          clearTimeMs: 900
        }
      }
    },
    ...overrides
  };
}

function createSharedRoom(overrides: Partial<RoomState> = {}): RoomState {
  const base = createRoom({
    settings: {
      roundCount: 3,
      leaderboardMode: "sum",
      roundDurationSec: 120,
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    },
    players: {
      host: {
        ...player,
        teamId: "team-1",
        roundScores: {}
      },
      mate: {
        id: "mate",
        nickname: "Mate",
        joinedAt: 1100,
        isHost: false,
        connected: true,
        lastSeenAt: 1100,
        roundScores: {},
        teamId: "team-1"
      },
      other: {
        id: "other",
        nickname: "Other",
        joinedAt: 1200,
        isHost: false,
        connected: true,
        lastSeenAt: 1200,
        roundScores: {},
        teamId: "team-2"
      }
    },
    sharedTeamBoards: {
      "0": {
        "team-1": {
          teamId: "team-1",
          removedAppleIds: [],
          score: 0,
          clearTimeMs: null,
          submittedAt: null
        },
        "team-2": {
          teamId: "team-2",
          removedAppleIds: [],
          score: 0,
          clearTimeMs: null,
          submittedAt: null
        }
      }
    },
    teamPointers: {},
    submissions: {}
  });

  return {
    ...base,
    ...overrides
  };
}

describe("GameScreen round transitions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(3000);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("pauses between rounds and does not auto-submit the previous round score into the next round", async () => {
    const onSubmitRound = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    const onForceProgress = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const renderRoom = async (room: RoomState): Promise<void> => {
      await act(async () => {
        root.render(
          <GameScreen
            key={`${room.phase}:${room.currentRoundIndex}:${room.roundStartedAt ?? "paused"}:${player.id}`}
            room={room}
            player={player}
            onLeaveRoom={() => {}}
            onVoteNextRound={() => Promise.resolve()}
            onSendChatMessage={() => Promise.resolve()}
            onSubmitRound={onSubmitRound}
            onSubmitSharedSelection={() => Promise.resolve()}
            onUpdateTeamPointer={() => Promise.resolve()}
            onForceProgress={onForceProgress}
          />
        );
      });
    };

    const overdueRoundOne = createRoom({
      phase: "playing",
      currentRoundIndex: 0,
      roundStartedAt: 0
    });

    await renderRoom(overdueRoundOne);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    const betweenRounds = createRoom({
      phase: "between-rounds",
      currentRoundIndex: 0,
      roundStartedAt: null
    });

    await renderRoom(betweenRounds);
    expect(container.textContent).toContain("2라운드 찬성하기");
    expect(container.textContent).toContain("전체 점수판");

    onSubmitRound.mockClear();
    onForceProgress.mockClear();

    const roundTwo = createRoom({
      phase: "playing",
      currentRoundIndex: 1,
      roundStartedAt: 3000,
      submissions: {
        "0": {
          host: {
            score: 7,
            finishedAt: 2000,
            clearTimeMs: 900
          }
        }
      }
    });

    await renderRoom(roundTwo);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(container.textContent).toContain("현재 점수판");
    expect(onSubmitRound).not.toHaveBeenCalled();
    expect(onForceProgress).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("3라운드 시작");
  });

  it("renders shared-team board progress plus teammate pointer and drag selection", async () => {
    const apples = generateApples("ROOM12-seed:0");
    const removedAppleId = apples[0].id;
    const room = createSharedRoom({
      seed: "ROOM12-seed",
      sharedTeamBoards: {
        "0": {
          "team-1": {
            teamId: "team-1",
            removedAppleIds: [removedAppleId],
            score: 1,
            clearTimeMs: null,
            submittedAt: null
          },
          "team-2": {
            teamId: "team-2",
            removedAppleIds: [],
            score: 0,
            clearTimeMs: null,
            submittedAt: null
          }
        }
      },
      teamPointers: {
        mate: {
          playerId: "mate",
          teamId: "team-1",
          roundIndex: 0,
          x: 160,
          y: 180,
          active: true,
          dragging: true,
          selectionStartX: 120,
          selectionStartY: 140,
          updatedAt: 3000
        },
        other: {
          playerId: "other",
          teamId: "team-2",
          roundIndex: 0,
          x: 260,
          y: 280,
          active: true,
          dragging: true,
          selectionStartX: 220,
          selectionStartY: 240,
          updatedAt: 3000
        }
      }
    });

    await act(async () => {
      root.render(
        <GameScreen
          room={room}
          player={room.players.host}
          onLeaveRoom={() => {}}
          onVoteNextRound={() => Promise.resolve()}
          onSendChatMessage={() => Promise.resolve()}
          onSubmitRound={() => Promise.resolve()}
          onSubmitSharedSelection={() => Promise.resolve()}
          onUpdateTeamPointer={() => Promise.resolve()}
          onForceProgress={() => Promise.resolve()}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(container.textContent).toContain("Mate");
    expect(container.querySelectorAll("img[alt='']")).toHaveLength(apples.length - 1);
    expect(container.querySelectorAll("[style*='--pointer-hue']")).toHaveLength(2);
  });

  it("keeps shared-team sync working even when the passed player prop has stale team data", async () => {
    const apples = generateApples("ROOM12-seed:0");
    const removedAppleId = apples[0].id;
    const room = createSharedRoom({
      seed: "ROOM12-seed",
      sharedTeamBoards: {
        "0": {
          "team-1": {
            teamId: "team-1",
            removedAppleIds: [removedAppleId],
            score: 1,
            clearTimeMs: null,
            submittedAt: null
          },
          "team-2": {
            teamId: "team-2",
            removedAppleIds: [],
            score: 0,
            clearTimeMs: null,
            submittedAt: null
          }
        }
      },
      teamPointers: {
        mate: {
          playerId: "mate",
          teamId: "team-1",
          roundIndex: 0,
          x: 160,
          y: 180,
          active: true,
          dragging: true,
          selectionStartX: 120,
          selectionStartY: 140,
          updatedAt: 3000
        }
      }
    });

    await act(async () => {
      root.render(
        <GameScreen
          room={room}
          player={{
            ...room.players.host,
            teamId: null
          }}
          onLeaveRoom={() => {}}
          onVoteNextRound={() => Promise.resolve()}
          onSendChatMessage={() => Promise.resolve()}
          onSubmitRound={() => Promise.resolve()}
          onSubmitSharedSelection={() => Promise.resolve()}
          onUpdateTeamPointer={() => Promise.resolve()}
          onForceProgress={() => Promise.resolve()}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(container.textContent).toContain("Mate");
    expect(container.querySelectorAll("img[alt='']")).toHaveLength(apples.length - 1);
    expect(container.querySelectorAll("[style*='--pointer-hue']")).toHaveLength(2);
  });

  it("sends shared pointer updates while dragging on the shared board", async () => {
    const onUpdateTeamPointer = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    const room = createSharedRoom({
      seed: "ROOM12-seed",
      players: {
        ...createSharedRoom().players,
        host: {
          ...createSharedRoom().players.host,
          lastSeenAt: 3000
        }
      }
    });

    await act(async () => {
      root.render(
        <GameScreen
          room={room}
          player={room.players.host}
          onLeaveRoom={() => {}}
          onVoteNextRound={() => Promise.resolve()}
          onSendChatMessage={() => Promise.resolve()}
          onSubmitRound={() => Promise.resolve()}
          onSubmitSharedSelection={() => Promise.resolve()}
          onUpdateTeamPointer={onUpdateTeamPointer}
          onForceProgress={() => Promise.resolve()}
        />
      );
    });

    const shell = container.querySelector("div[style*='--board-width']") as HTMLDivElement | null;
    expect(shell).not.toBeNull();

    Object.defineProperty(shell!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        right: BOARD_WIDTH,
        bottom: BOARD_HEIGHT,
        x: 0,
        y: 0,
        toJSON: () => {}
      })
    });

    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 120,
      clientY: 140
    });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });

    const pointerMove = new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 180,
      clientY: 210
    });
    Object.defineProperty(pointerMove, "pointerId", { value: 1 });

    shell!.setPointerCapture = vi.fn();
    shell!.hasPointerCapture = vi.fn().mockReturnValue(false);

    await act(async () => {
      shell!.dispatchEvent(pointerDown);
    });

    await act(async () => {
      shell!.dispatchEvent(pointerMove);
    });

    expect(onUpdateTeamPointer).toHaveBeenCalled();
    expect(onUpdateTeamPointer.mock.calls[0]).toEqual([0, 120, 140, true, true, 120, 140]);
    expect(onUpdateTeamPointer.mock.calls[onUpdateTeamPointer.mock.calls.length - 1]).toEqual([
      0,
      180,
      210,
      true,
      true,
      120,
      140
    ]);
  });

  it("requests force progress when the final round times out after the local player already submitted", async () => {
    const onForceProgress = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const room = createRoom({
      settings: {
        roundCount: 1,
        leaderboardMode: "sum",
        roundDurationSec: 1,
        gameMode: "solo",
        teamMode: "individual",
        teamCount: 2
      },
      submissions: {
        "0": {
          host: {
            score: 7,
            finishedAt: 1500,
            clearTimeMs: null
          }
        }
      },
      roundStartedAt: 0
    });

    await act(async () => {
      root.render(
        <GameScreen
          room={room}
          player={room.players.host}
          onLeaveRoom={() => {}}
          onVoteNextRound={() => Promise.resolve()}
          onSendChatMessage={() => Promise.resolve()}
          onSubmitRound={() => Promise.resolve()}
          onSubmitSharedSelection={() => Promise.resolve()}
          onUpdateTeamPointer={() => Promise.resolve()}
          onForceProgress={onForceProgress}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1250);
    });

    expect(onForceProgress).toHaveBeenCalledTimes(1);
  });
});
