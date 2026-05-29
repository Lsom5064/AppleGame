import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LeaderboardScreen } from "../components/LeaderboardScreen";
import type { PlayerState, RoomState } from "../types";

const player: PlayerState = {
  id: "host",
  nickname: "Host",
  joinedAt: 1000,
  isHost: true,
  connected: true,
  lastSeenAt: 1000,
  roundScores: { "0": 7, "1": 5, "2": 0 },
  teamId: null
};

function createFinishedRoom(): RoomState {
  return {
    code: "ROOM12",
    name: "테스트 방",
    hostId: "host",
    seed: "ROOM12-seed",
    createdAt: 1000,
    phase: "finished",
    settings: {
      roundCount: 3,
      leaderboardMode: "sum",
      roundDurationSec: 120,
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
    currentRoundIndex: 1,
    roundStartedAt: null,
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
    liveScores: {},
    submissions: {
      "0": {
        host: {
          score: 7,
          finishedAt: 2000,
          clearTimeMs: 900
        }
      },
      "1": {
        host: {
          score: 5,
          finishedAt: 3000,
          clearTimeMs: null
        }
      },
      "2": {
        host: {
          score: 0,
          finishedAt: 0,
          clearTimeMs: null
        }
      }
    }
  };
}

describe("LeaderboardScreen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not render a placeholder dash under round scores when clear time is missing", async () => {
    await act(async () => {
      root.render(
        <LeaderboardScreen
          room={createFinishedRoom()}
          player={player}
          onLeaveRoom={() => {}}
          onSendChatMessage={() => Promise.resolve()}
          onRestartGame={() => Promise.resolve()}
          onReturnToLobby={() => Promise.resolve()}
        />
      );
    });

    expect(container.textContent).toContain("결과 / 개인전 / 3판 합계");
    expect(container.textContent).toContain("로비로 돌아가기");
    expect(container.textContent).not.toContain("5-");
    expect(container.textContent).not.toContain("7-");
  });
});
