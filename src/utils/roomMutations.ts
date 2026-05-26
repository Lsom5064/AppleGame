import { ROUND_DURATION_DEFAULT, SUBMISSION_GRACE_MS } from "../constants";
import type { GameSettings, PlayerState, RoomState, RoundSubmission } from "../types";
import { createSeededRandom } from "./random";
import { generateRoomCode } from "./roomCode";

function normalizePlayer(playerId: string, player: Partial<PlayerState>): PlayerState {
  return {
    id: player.id ?? playerId,
    nickname: player.nickname ?? "Unknown",
    joinedAt: player.joinedAt ?? 0,
    isHost: player.isHost ?? false,
    roundScores: { ...(player.roundScores ?? {}) }
  };
}

export function normalizeRoomState(room: RoomState): RoomState {
  return {
    ...room,
    settings: {
      roundCount: room.settings?.roundCount ?? 1,
      leaderboardMode: room.settings?.leaderboardMode ?? "sum",
      roundDurationSec: room.settings?.roundDurationSec ?? ROUND_DURATION_DEFAULT
    },
    players: Object.fromEntries(
      Object.entries(room.players ?? {}).map(([playerId, player]) => [
        playerId,
        normalizePlayer(playerId, player)
      ])
    ),
    submissions: Object.fromEntries(
      Object.entries(room.submissions ?? {}).map(([roundKey, roundEntries]) => [
        roundKey,
        Object.fromEntries(
          Object.entries(roundEntries ?? {}).map(([playerId, submission]) => [
            playerId,
            {
              ...(submission as RoundSubmission),
              clearTimeMs: (submission as Partial<RoundSubmission>)?.clearTimeMs ?? null
            }
          ])
        )
      ])
    )
  };
}

function cloneRoom(room: RoomState): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  return {
    ...normalizedRoom,
    settings: { ...normalizedRoom.settings },
    players: Object.fromEntries(
      Object.entries(normalizedRoom.players).map(([playerId, player]) => [
        playerId,
        {
          ...player,
          roundScores: { ...player.roundScores }
        }
      ])
    ),
    submissions: Object.fromEntries(
      Object.entries(normalizedRoom.submissions).map(([roundKey, roundEntries]) => [
        roundKey,
        Object.fromEntries(
          Object.entries(roundEntries).map(([playerId, submission]) => [playerId, { ...submission }])
        )
      ])
    )
  };
}

export function createInitialRoom(code: string, hostId: string, nickname: string, now: number): RoomState {
  const settings: GameSettings = {
    roundCount: 1,
    leaderboardMode: "sum",
    roundDurationSec: ROUND_DURATION_DEFAULT
  };

  return {
    code,
    hostId,
    seed: `${code}-${now}`,
    createdAt: now,
    phase: "lobby",
    settings,
    currentRoundIndex: 0,
    roundStartedAt: null,
    players: {
      [hostId]: {
        id: hostId,
        nickname,
        joinedAt: now,
        isHost: true,
        roundScores: {}
      }
    },
    submissions: {}
  };
}

export function createNewRoomCode(existingCodes: string[]): string {
  const existing = new Set(existingCodes);
  const random = createSeededRandom(`${existingCodes.join(",")}:${existingCodes.length}:${Date.now()}`);

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const code = generateRoomCode(random);
    if (!existing.has(code)) {
      return code;
    }
  }

  throw new Error("사용 가능한 방 코드를 생성하지 못했습니다.");
}

export function joinRoom(room: RoomState, playerId: string, nickname: string, now: number): RoomState {
  const nextRoom = cloneRoom(room);

  if (nextRoom.phase !== "lobby") {
    throw new Error("이미 게임이 시작된 방입니다.");
  }

  nextRoom.players[playerId] = {
    id: playerId,
    nickname,
    joinedAt: now,
    isHost: false,
    roundScores: {}
  };

  return nextRoom;
}

export function updateRoomSettings(
  room: RoomState,
  playerId: string,
  settings: Partial<Pick<GameSettings, "roundCount" | "leaderboardMode">>
): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 설정을 변경할 수 있습니다.");
  }

  if (normalizedRoom.phase !== "lobby") {
    throw new Error("게임 시작 후에는 설정을 변경할 수 없습니다.");
  }

  return {
    ...normalizedRoom,
    settings: {
      ...normalizedRoom.settings,
      ...settings
    }
  };
}

export function startRoomGame(room: RoomState, playerId: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 게임을 시작할 수 있습니다.");
  }

  if (normalizedRoom.phase !== "lobby") {
    throw new Error("이미 시작된 게임입니다.");
  }

  return {
    ...normalizedRoom,
    phase: "playing",
    currentRoundIndex: 0,
    roundStartedAt: now,
    submissions: {},
    players: Object.fromEntries(
      Object.entries(normalizedRoom.players).map(([id, player]) => [
        id,
        {
          ...player,
          roundScores: {}
        }
      ])
    )
  };
}

function shouldAdvance(room: RoomState, now: number): boolean {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.phase !== "playing" || normalizedRoom.roundStartedAt === null) {
    return false;
  }

  const playerIds = Object.keys(normalizedRoom.players);
  const roundKey = String(normalizedRoom.currentRoundIndex);
  const roundSubmissions = normalizedRoom.submissions[roundKey] ?? {};
  const allSubmitted = playerIds.every((playerId) => Boolean(roundSubmissions[playerId]));
  const expired =
    now >=
    normalizedRoom.roundStartedAt + normalizedRoom.settings.roundDurationSec * 1000 + SUBMISSION_GRACE_MS;

  return allSubmitted || expired;
}

export function forceRoomProgress(room: RoomState, now: number): RoomState {
  if (!shouldAdvance(room, now)) {
    return room;
  }

  const nextRoom = cloneRoom(room);
  const roundKey = String(nextRoom.currentRoundIndex);
  const roundSubmissions = nextRoom.submissions[roundKey] ?? {};

  for (const player of Object.values(nextRoom.players)) {
    if (roundSubmissions[player.id]) {
      continue;
    }

    roundSubmissions[player.id] = {
      score: 0,
      finishedAt: now,
      clearTimeMs: null
    };
    player.roundScores[roundKey] = 0;
  }

  nextRoom.submissions[roundKey] = roundSubmissions;

  const isLastRound = nextRoom.currentRoundIndex + 1 >= nextRoom.settings.roundCount;

  if (isLastRound) {
    nextRoom.phase = "finished";
    return nextRoom;
  }

  nextRoom.currentRoundIndex += 1;
  nextRoom.roundStartedAt = now;

  return nextRoom;
}

export function submitRoundScore(
  room: RoomState,
  playerId: string,
  roundIndex: number,
  score: number,
  clearTimeMs: number | null,
  now: number
): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.phase !== "playing") {
    return room;
  }

  if (roundIndex !== normalizedRoom.currentRoundIndex) {
    return room;
  }

  if (!normalizedRoom.players[playerId]) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  const roundKey = String(roundIndex);
  nextRoom.submissions[roundKey] ??= {};

  if (nextRoom.submissions[roundKey][playerId]) {
    return forceRoomProgress(nextRoom, now);
  }

  nextRoom.submissions[roundKey][playerId] = {
    score,
    finishedAt: now,
    clearTimeMs
  };
  nextRoom.players[playerId].roundScores[roundKey] = score;

  return forceRoomProgress(nextRoom, now);
}

export function leaveRoom(room: RoomState, playerId: string): RoomState | null {
  const normalizedRoom = normalizeRoomState(room);

  if (!normalizedRoom.players[playerId]) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  delete nextRoom.players[playerId];

  if (Object.keys(nextRoom.players).length === 0) {
    return null;
  }

  if (nextRoom.hostId === playerId) {
    const nextHost = Object.values(nextRoom.players).sort((left, right) => left.joinedAt - right.joinedAt)[0];
    nextRoom.hostId = nextHost.id;
    nextRoom.players[nextHost.id].isHost = true;
  }

  return nextRoom;
}
