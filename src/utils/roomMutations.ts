import { ROUND_DURATION_DEFAULT, SUBMISSION_GRACE_MS } from "../constants";
import type {
  CreateRoomOptions,
  GameSettings,
  PlayerState,
  RoomChatMessage,
  RoomState,
  RoundSubmission
} from "../types";
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

function normalizeRoomName(name: string | undefined, hostNickname: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `${hostNickname}님의 방`;
}

export function normalizeRoomState(room: RoomState): RoomState {
  const normalizedPhase =
    room.phase === "playing" && room.roundStartedAt === null ? "between-rounds" : room.phase;
  const hostNickname = room.players?.[room.hostId]?.nickname ?? "Host";

  return {
    ...room,
    name: normalizeRoomName(room.name, hostNickname),
    phase: normalizedPhase,
    settings: {
      roundCount: room.settings?.roundCount ?? 1,
      leaderboardMode: room.settings?.leaderboardMode ?? "sum",
      roundDurationSec: room.settings?.roundDurationSec ?? ROUND_DURATION_DEFAULT
    },
    access: {
      password: room.access?.password?.trim() ? room.access.password.trim() : null,
      isPublic: room.access?.isPublic ?? true
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
    ),
    nextRoundVotes: Object.fromEntries(
      Object.entries(room.nextRoundVotes ?? {}).filter(([, voted]) => voted === true)
    ),
    chatMessages: (room.chatMessages ?? [])
      .filter((message): message is RoomChatMessage => Boolean(message?.id) && Boolean(message?.nickname))
      .map((message) => ({
        ...message,
        text: message.text?.trim() ?? ""
      }))
      .filter((message) => message.text.length > 0)
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
    ),
    nextRoundVotes: { ...normalizedRoom.nextRoundVotes },
    chatMessages: normalizedRoom.chatMessages.map((message) => ({ ...message }))
  };
}

export function createInitialRoom(
  code: string,
  hostId: string,
  nickname: string,
  now: number,
  options?: CreateRoomOptions
): RoomState {
  const settings: GameSettings = {
    roundCount: 1,
    leaderboardMode: "sum",
    roundDurationSec: ROUND_DURATION_DEFAULT
  };
  const normalizedPassword = options?.password.trim() ? options.password.trim() : null;
  const roomName = normalizeRoomName(options?.name, nickname);

  return {
    code,
    name: roomName,
    hostId,
    seed: `${code}-${now}`,
    createdAt: now,
    phase: "lobby",
    settings,
    access: {
      password: normalizedPassword,
      isPublic: options?.isPublic ?? true
    },
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
    submissions: {},
    nextRoundVotes: {},
    chatMessages: []
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

export function joinRoom(
  room: RoomState,
  playerId: string,
  nickname: string,
  now: number,
  password?: string
): RoomState {
  const nextRoom = cloneRoom(room);
  const existingPlayer = nextRoom.players[playerId];

  if (existingPlayer) {
    nextRoom.players[playerId] = {
      ...existingPlayer,
      nickname
    };
    return nextRoom;
  }

  if (nextRoom.phase !== "lobby") {
    throw new Error("이미 게임이 시작된 방입니다.");
  }

  if (nextRoom.access.password && nextRoom.access.password !== (password?.trim() ?? "")) {
    throw new Error("비밀번호가 올바르지 않습니다.");
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

export function addRoomChatMessage(room: RoomState, playerId: string, text: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);
  const player = normalizedRoom.players[playerId];
  const trimmedText = text.trim();

  if (!player || !trimmedText) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  nextRoom.chatMessages.push({
    id: `${playerId}:${now}:${nextRoom.chatMessages.length}`,
    playerId,
    nickname: player.nickname,
    text: trimmedText,
    createdAt: now
  });

  if (nextRoom.chatMessages.length > 100) {
    nextRoom.chatMessages = nextRoom.chatMessages.slice(-100);
  }

  return nextRoom;
}

export function startRoomGame(room: RoomState, playerId: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 게임을 시작할 수 있습니다.");
  }

  if (normalizedRoom.phase === "playing" || normalizedRoom.phase === "between-rounds") {
    throw new Error("이미 진행 중인 게임입니다.");
  }

  return {
    ...normalizedRoom,
    seed: `${normalizedRoom.code}-${now}`,
    phase: "playing",
    currentRoundIndex: 0,
    roundStartedAt: now,
    submissions: {},
    nextRoundVotes: {},
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
  nextRoom.nextRoundVotes = {};

  const isLastRound = nextRoom.currentRoundIndex + 1 >= nextRoom.settings.roundCount;

  if (isLastRound) {
    nextRoom.phase = "finished";
    nextRoom.roundStartedAt = null;
    return nextRoom;
  }

  nextRoom.phase = "between-rounds";
  nextRoom.roundStartedAt = null;

  return nextRoom;
}

export function startNextRound(room: RoomState, playerId: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 다음 게임을 시작할 수 있습니다.");
  }

  if (normalizedRoom.phase !== "between-rounds") {
    throw new Error("다음 라운드를 시작할 수 없는 상태입니다.");
  }

  return {
    ...normalizedRoom,
    phase: "playing",
    currentRoundIndex: normalizedRoom.currentRoundIndex + 1,
    roundStartedAt: now,
    nextRoundVotes: {}
  };
}

export function voteForNextRound(room: RoomState, playerId: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.phase !== "between-rounds") {
    return room;
  }

  if (!normalizedRoom.players[playerId]) {
    return room;
  }

  if (normalizedRoom.nextRoundVotes[playerId]) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  nextRoom.nextRoundVotes[playerId] = true;

  const playerIds = Object.keys(nextRoom.players);
  const everyoneAgreed = playerIds.every((id) => nextRoom.nextRoundVotes[id] === true);

  if (!everyoneAgreed) {
    return nextRoom;
  }

  return {
    ...nextRoom,
    phase: "playing",
    currentRoundIndex: nextRoom.currentRoundIndex + 1,
    roundStartedAt: now,
    nextRoundVotes: {}
  };
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
