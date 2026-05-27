import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen } from "../components/GameScreen";
import type { PlayerState, RoomState } from "../types";

const player: PlayerState = {
  id: "host",
  nickname: "Host",
  joinedAt: 1000,
  isHost: true,
  roundScores: { "0": 7 }
};

function createRoom(overrides: Partial<RoomState>): RoomState {
  return {
    code: "ROOM12",
    hostId: "host",
    seed: "ROOM12-seed",
    createdAt: 1000,
    phase: "playing",
    settings: {
      roundCount: 3,
      leaderboardMode: "sum",
      roundDurationSec: 1
    },
    access: {
      password: null,
      isPublic: true
    },
    currentRoundIndex: 0,
    roundStartedAt: 1000,
    players: {
      host: {
        ...player,
        roundScores: { ...player.roundScores }
      }
    },
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
            onStartNextRound={() => Promise.resolve()}
            onSubmitRound={onSubmitRound}
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
    expect(container.textContent).toContain("2라운드 시작");

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

    expect(onSubmitRound).not.toHaveBeenCalled();
    expect(onForceProgress).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("3라운드 시작");
  });
});
