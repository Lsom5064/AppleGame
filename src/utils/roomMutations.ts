import { APPLE_COUNT, ROUND_DURATION_DEFAULT, SUBMISSION_GRACE_MS } from "../constants";
import type {
  CreateRoomOptions,
  GameSettings,
  GameMode,
  PlayerState,
  RoomChatMessage,
  RoomState,
  RoundSubmission,
  SharedTeamBoardState,
  TeamMode,
  TeamPointerState,
  TeamState
} from "../types";
import { generateApples } from "./gameBoard";
import { createSeededRandom } from "./random";
import { getConnectedPlayerIds } from "./presence";
import { generateRoomCode } from "./roomCode";
import { calculateSelectionScore } from "./scoring";
import { clampTeamCount, createTeams, isValidTeamId, sortPlayersByJoinOrder } from "./teams";

function normalizePlayer(playerId: string, player: Partial<PlayerState>): PlayerState {
  return {
    id: player.id ?? playerId,
    nickname: player.nickname ?? "Unknown",
    joinedAt: player.joinedAt ?? 0,
    isHost: player.isHost ?? false,
    connected: player.connected ?? true,
    lastSeenAt: player.lastSeenAt ?? player.joinedAt ?? 0,
    roundScores: { ...(player.roundScores ?? {}) },
    teamId: player.teamId ?? null
  };
}

function normalizeRoomName(name: string | undefined, hostNickname: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `${hostNickname}님의 방`;
}

function normalizeGameMode(gameMode: GameMode | undefined): GameMode {
  return gameMode === "team" ? "team" : "solo";
}

function normalizeTeamMode(teamMode: TeamMode | undefined): TeamMode {
  return teamMode === "shared" ? "shared" : "individual";
}

function normalizeTeams(teams: TeamState[] | undefined, teamCount: number): TeamState[] {
  const fallbackTeams = createTeams(teamCount);

  if (!teams || teams.length === 0) {
    return fallbackTeams;
  }

  return Array.from({ length: teamCount }, (_, index) => {
    const team = teams[index];
    const fallbackTeam = fallbackTeams[index];

    return {
      id: team?.id ?? fallbackTeam.id,
      name: team?.name?.trim() ? team.name.trim() : fallbackTeam.name
    };
  });
}

function syncPlayerTeams(players: Record<string, PlayerState>, teams: TeamState[]): Record<string, PlayerState> {
  return Object.fromEntries(
    Object.entries(players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        teamId: isValidTeamId(teams, player.teamId) ? player.teamId : null
      }
    ])
  );
}

function ensureTeamAssignments(room: RoomState): RoomState {
  if (room.settings.gameMode !== "team") {
    return room;
  }

  const nextRoom = cloneRoom(room);
  const teams = nextRoom.teams;
  const orderedPlayers = sortPlayersByJoinOrder(nextRoom.players);
  let assignmentIndex = 0;

  for (const member of orderedPlayers) {
    if (isValidTeamId(teams, member.teamId)) {
      continue;
    }

    member.teamId = teams[assignmentIndex % teams.length]?.id ?? null;
    assignmentIndex += 1;
  }

  return nextRoom;
}

function touchPlayer(nextRoom: RoomState, playerId: string, now: number): void {
  const player = nextRoom.players[playerId];

  if (!player) {
    return;
  }

  nextRoom.players[playerId] = {
    ...player,
    connected: true,
    lastSeenAt: now
  };
}

function getConsensusPlayerIds(room: RoomState, now = Date.now()): string[] {
  const connectedPlayerIds = getConnectedPlayerIds(room, now);

  return connectedPlayerIds.length > 0 ? connectedPlayerIds : Object.keys(room.players);
}

function createSharedBoardState(teamId: string): SharedTeamBoardState {
  return {
    teamId,
    removedAppleIds: [],
    score: 0,
    clearTimeMs: null,
    submittedAt: null
  };
}

function normalizeSharedBoardState(
  board: Partial<SharedTeamBoardState> | undefined,
  teamId: string
): SharedTeamBoardState {
  return {
    teamId,
    removedAppleIds: Array.from(
      new Set(
        (board?.removedAppleIds ?? [])
          .map((appleId) => appleId?.trim())
          .filter((appleId): appleId is string => Boolean(appleId))
      )
    ),
    score: board?.score ?? 0,
    clearTimeMs: board?.clearTimeMs ?? null,
    submittedAt: board?.submittedAt ?? null
  };
}

function normalizeSharedBoards(
  boards: RoomState["sharedTeamBoards"] | undefined,
  teams: TeamState[]
): RoomState["sharedTeamBoards"] {
  return Object.fromEntries(
    Object.entries(boards ?? {}).map(([roundKey, roundBoards]) => [
      roundKey,
      Object.fromEntries(
        teams.map((team) => [team.id, normalizeSharedBoardState(roundBoards?.[team.id], team.id)])
      )
    ])
  );
}

function normalizeTeamPointers(
  pointers: RoomState["teamPointers"] | undefined,
  players: Record<string, PlayerState>,
  teams: TeamState[]
): Record<string, TeamPointerState> {
  return Object.fromEntries(
    Object.entries(pointers ?? {})
      .filter(([playerId, pointer]) => Boolean(players[playerId]) && isValidTeamId(teams, pointer?.teamId))
      .map(([playerId, pointer]) => [
        playerId,
        {
          playerId,
          teamId: pointer.teamId,
          roundIndex: pointer.roundIndex ?? 0,
          x: pointer.x ?? 0,
          y: pointer.y ?? 0,
          active: pointer.active ?? false,
          dragging: pointer.dragging ?? false,
          selectionStartX: pointer.selectionStartX ?? pointer.x ?? 0,
          selectionStartY: pointer.selectionStartY ?? pointer.y ?? 0,
          updatedAt: pointer.updatedAt ?? 0
        }
      ])
  );
}

function ensureRoundSharedBoards(room: RoomState, roundIndex: number): RoomState {
  const nextRoom = cloneRoom(room);
  const roundKey = String(roundIndex);
  nextRoom.sharedTeamBoards[roundKey] ??= {};

  for (const team of nextRoom.teams) {
    nextRoom.sharedTeamBoards[roundKey][team.id] ??= createSharedBoardState(team.id);
  }

  return nextRoom;
}

function getRoundSeed(room: RoomState, roundIndex: number): string {
  return `${room.seed}:${roundIndex}`;
}

function createAppleValueMap(room: RoomState, roundIndex: number): Map<string, number> {
  return new Map(generateApples(getRoundSeed(room, roundIndex)).map((apple) => [apple.id, apple.value]));
}

function submitSharedBoardForTeam(
  room: RoomState,
  roundIndex: number,
  teamId: string,
  now: number
): RoomState {
  const nextRoom = ensureRoundSharedBoards(room, roundIndex);
  const roundKey = String(roundIndex);
  const board = nextRoom.sharedTeamBoards[roundKey]?.[teamId];

  if (!board || board.submittedAt !== null) {
    return nextRoom;
  }

  const members = Object.values(nextRoom.players).filter((member) => member.teamId === teamId);
  nextRoom.submissions[roundKey] ??= {};

  for (const member of members) {
    if (nextRoom.submissions[roundKey][member.id]) {
      continue;
    }

    nextRoom.submissions[roundKey][member.id] = {
      score: board.score,
      finishedAt: now,
      clearTimeMs: board.clearTimeMs
    };
    nextRoom.players[member.id].roundScores[roundKey] = board.score;
  }

  board.submittedAt = now;
  return nextRoom;
}

export function normalizeRoomState(room: RoomState): RoomState {
  const normalizedPhase =
    room.phase === "playing" && room.roundStartedAt === null ? "between-rounds" : room.phase;
  const hostNickname = room.players?.[room.hostId]?.nickname ?? "Host";
  const teamCount = clampTeamCount(room.settings?.teamCount ?? 2);
  const teams = normalizeTeams(room.teams, teamCount);
  const players = syncPlayerTeams(
    Object.fromEntries(
      Object.entries(room.players ?? {}).map(([playerId, player]) => [
        playerId,
        normalizePlayer(playerId, player)
      ])
    ),
    teams
  );
  const sharedTeamBoards = normalizeSharedBoards(room.sharedTeamBoards, teams);
  const teamPointers = normalizeTeamPointers(room.teamPointers, players, teams);

  return {
    ...room,
    name: normalizeRoomName(room.name, hostNickname),
    phase: normalizedPhase,
    settings: {
      roundCount: room.settings?.roundCount ?? 1,
      leaderboardMode: room.settings?.leaderboardMode ?? "sum",
      roundDurationSec: room.settings?.roundDurationSec ?? ROUND_DURATION_DEFAULT,
      gameMode: normalizeGameMode(room.settings?.gameMode),
      teamMode: normalizeTeamMode(room.settings?.teamMode),
      teamCount
    },
    access: {
      password: room.access?.password?.trim() ? room.access.password.trim() : null,
      isPublic: room.access?.isPublic ?? true
    },
    players,
    teams,
    sharedTeamBoards,
    teamPointers,
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
    teams: normalizedRoom.teams.map((team) => ({ ...team })),
    sharedTeamBoards: Object.fromEntries(
      Object.entries(normalizedRoom.sharedTeamBoards).map(([roundKey, roundBoards]) => [
        roundKey,
        Object.fromEntries(
          Object.entries(roundBoards).map(([teamId, board]) => [
            teamId,
            {
              ...board,
              removedAppleIds: [...board.removedAppleIds]
            }
          ])
        )
      ])
    ),
    teamPointers: Object.fromEntries(
      Object.entries(normalizedRoom.teamPointers).map(([playerId, pointer]) => [playerId, { ...pointer }])
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
    roundDurationSec: ROUND_DURATION_DEFAULT,
    gameMode: "solo",
    teamMode: "individual",
    teamCount: 2
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
        connected: true,
        lastSeenAt: now,
        roundScores: {},
        teamId: null
      }
    },
    teams: createTeams(settings.teamCount),
    sharedTeamBoards: {},
    teamPointers: {},
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
      nickname,
      connected: true,
      lastSeenAt: now
    };
    delete nextRoom.teamPointers[playerId];
    return nextRoom.settings.gameMode === "team" ? ensureTeamAssignments(nextRoom) : nextRoom;
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
    connected: true,
    lastSeenAt: now,
    roundScores: {},
    teamId: null
  };

  return nextRoom.settings.gameMode === "team" ? ensureTeamAssignments(nextRoom) : nextRoom;
}

export function updateRoomSettings(
  room: RoomState,
  playerId: string,
  settings: Partial<Pick<GameSettings, "roundCount" | "leaderboardMode" | "gameMode" | "teamMode" | "teamCount">>
): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 설정을 변경할 수 있습니다.");
  }

  if (normalizedRoom.phase !== "lobby") {
    throw new Error("게임 시작 후에는 설정을 변경할 수 없습니다.");
  }

  const nextTeamCount = clampTeamCount(settings.teamCount ?? normalizedRoom.settings.teamCount);
  const nextTeams = normalizeTeams(normalizedRoom.teams, nextTeamCount);
  const nextPlayers = syncPlayerTeams(
    Object.fromEntries(
      Object.entries(normalizedRoom.players).map(([nextPlayerId, member]) => [
        nextPlayerId,
        {
          ...member
        }
      ])
    ),
    nextTeams
  );

  const nextRoom: RoomState = {
    ...normalizedRoom,
    settings: {
      ...normalizedRoom.settings,
      ...settings,
      gameMode: normalizeGameMode(settings.gameMode ?? normalizedRoom.settings.gameMode),
      teamMode: normalizeTeamMode(settings.teamMode ?? normalizedRoom.settings.teamMode),
      teamCount: nextTeamCount
    },
    players: nextPlayers,
    teams: nextTeams
  };

  return nextRoom.settings.gameMode === "team" ? ensureTeamAssignments(nextRoom) : nextRoom;
}

export function addRoomChatMessage(room: RoomState, playerId: string, text: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);
  const player = normalizedRoom.players[playerId];
  const trimmedText = text.trim();

  if (!player || !trimmedText) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  touchPlayer(nextRoom, playerId, now);
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

export function randomizeRoomTeams(room: RoomState, playerId: string, now: number): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 팀을 랜덤 배정할 수 있습니다.");
  }

  if (normalizedRoom.phase !== "lobby") {
    throw new Error("게임 시작 후에는 팀을 바꿀 수 없습니다.");
  }

  if (normalizedRoom.settings.gameMode !== "team") {
    throw new Error("팀전 모드에서만 팀을 배정할 수 있습니다.");
  }

  const nextRoom = cloneRoom(normalizedRoom);
  const orderedPlayers = sortPlayersByJoinOrder(nextRoom.players);
  const random = createSeededRandom(`${nextRoom.seed}:${now}:${orderedPlayers.length}`);

  for (let index = orderedPlayers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = orderedPlayers[index];
    orderedPlayers[index] = orderedPlayers[swapIndex];
    orderedPlayers[swapIndex] = current;
  }

  orderedPlayers.forEach((member, index) => {
    member.teamId = nextRoom.teams[index % nextRoom.teams.length]?.id ?? null;
  });

  return nextRoom;
}

export function assignRoomPlayerTeam(
  room: RoomState,
  playerId: string,
  targetPlayerId: string,
  teamId: string
): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.hostId !== playerId) {
    throw new Error("방장만 팀을 직접 배정할 수 있습니다.");
  }

  if (normalizedRoom.phase !== "lobby") {
    throw new Error("게임 시작 후에는 팀을 바꿀 수 없습니다.");
  }

  if (normalizedRoom.settings.gameMode !== "team") {
    throw new Error("팀전 모드에서만 팀을 배정할 수 있습니다.");
  }

  if (!normalizedRoom.players[targetPlayerId]) {
    throw new Error("플레이어 정보를 찾을 수 없습니다.");
  }

  if (!isValidTeamId(normalizedRoom.teams, teamId)) {
    throw new Error("유효하지 않은 팀입니다.");
  }

  const nextRoom = cloneRoom(normalizedRoom);
  nextRoom.players[targetPlayerId].teamId = teamId;
  return nextRoom;
}

export function updateTeamPointer(
  room: RoomState,
  playerId: string,
  roundIndex: number,
  x: number,
  y: number,
  active: boolean,
  now: number,
  dragging = false,
  selectionStartX = x,
  selectionStartY = y
): RoomState {
  const normalizedRoom = normalizeRoomState(room);
  const player = normalizedRoom.players[playerId];

  if (!player || player.teamId === null) {
    return room;
  }

  if (normalizedRoom.settings.gameMode !== "team" || normalizedRoom.settings.teamMode !== "shared") {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  touchPlayer(nextRoom, playerId, now);
  nextRoom.teamPointers[playerId] = {
    playerId,
    teamId: player.teamId,
    roundIndex,
    x,
    y,
    active,
    dragging,
    selectionStartX,
    selectionStartY,
    updatedAt: now
  };

  return nextRoom;
}

export function updatePlayerPresence(
  room: RoomState,
  playerId: string,
  connected: boolean,
  now: number
): RoomState {
  const normalizedRoom = normalizeRoomState(room);
  const player = normalizedRoom.players[playerId];

  if (!player) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  nextRoom.players[playerId] = {
    ...nextRoom.players[playerId],
    connected,
    lastSeenAt: now
  };

  if (!connected) {
    delete nextRoom.teamPointers[playerId];
  }

  return nextRoom;
}

export function clearTeamPointer(room: RoomState, playerId: string): RoomState {
  const normalizedRoom = normalizeRoomState(room);

  if (!normalizedRoom.teamPointers[playerId]) {
    return room;
  }

  const nextRoom = cloneRoom(normalizedRoom);
  delete nextRoom.teamPointers[playerId];
  return nextRoom;
}

export function applySharedTeamSelection(
  room: RoomState,
  playerId: string,
  roundIndex: number,
  appleIds: string[],
  clearTimeMs: number | null,
  now: number
): RoomState {
  const normalizedRoom = normalizeRoomState(room);
  const player = normalizedRoom.players[playerId];

  if (!player || player.teamId === null) {
    return room;
  }

  if (normalizedRoom.phase !== "playing") {
    return room;
  }

  if (normalizedRoom.settings.gameMode !== "team" || normalizedRoom.settings.teamMode !== "shared") {
    return room;
  }

  if (roundIndex !== normalizedRoom.currentRoundIndex) {
    return room;
  }

  const uniqueAppleIds = Array.from(new Set(appleIds));

  if (uniqueAppleIds.length === 0) {
    return room;
  }

  const nextRoom = ensureRoundSharedBoards(normalizedRoom, roundIndex);
  touchPlayer(nextRoom, playerId, now);
  const roundKey = String(roundIndex);
  const board = nextRoom.sharedTeamBoards[roundKey]?.[player.teamId];

  if (!board || board.submittedAt !== null) {
    return room;
  }

  const removedAppleIds = new Set(board.removedAppleIds);

  if (uniqueAppleIds.some((appleId) => removedAppleIds.has(appleId))) {
    return room;
  }

  const appleValues = createAppleValueMap(nextRoom, roundIndex);
  let sum = 0;

  for (const appleId of uniqueAppleIds) {
    const value = appleValues.get(appleId);

    if (value === undefined) {
      return room;
    }

    sum += value;
  }

  if (sum !== 10) {
    return room;
  }

  board.removedAppleIds.push(...uniqueAppleIds);
  board.score += calculateSelectionScore(uniqueAppleIds.length);

  if (board.removedAppleIds.length >= APPLE_COUNT && board.clearTimeMs === null) {
    board.clearTimeMs = clearTimeMs;
    return forceRoomProgress(submitSharedBoardForTeam(nextRoom, roundIndex, player.teamId, now), now);
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

  const preparedRoom = ensureTeamAssignments(normalizedRoom);
  const startedRoom: RoomState = {
    ...preparedRoom,
    seed: `${preparedRoom.code}-${now}`,
    phase: "playing",
    currentRoundIndex: 0,
    roundStartedAt: now,
    sharedTeamBoards: {},
    teamPointers: {},
    submissions: {},
    nextRoundVotes: {},
    players: Object.fromEntries(
      Object.entries(preparedRoom.players).map(([id, player]) => [
        id,
        {
          ...player,
          roundScores: {}
        }
      ])
    )
  };

  return preparedRoom.settings.gameMode === "team" && preparedRoom.settings.teamMode === "shared"
    ? ensureRoundSharedBoards(startedRoom, 0)
    : startedRoom;
}

function shouldAdvance(room: RoomState, now: number): boolean {
  const normalizedRoom = normalizeRoomState(room);

  if (normalizedRoom.phase !== "playing" || normalizedRoom.roundStartedAt === null) {
    return false;
  }

  const playerIds = getConsensusPlayerIds(normalizedRoom, now);
  const roundKey = String(normalizedRoom.currentRoundIndex);
  const roundSubmissions = normalizedRoom.submissions[roundKey] ?? {};
  const expired =
    now >=
    normalizedRoom.roundStartedAt + normalizedRoom.settings.roundDurationSec * 1000 + SUBMISSION_GRACE_MS;

  if (normalizedRoom.settings.gameMode === "team" && normalizedRoom.settings.teamMode === "shared") {
    const connectedTeamIds = Array.from(
      new Set(
        playerIds
          .map((playerId) => normalizedRoom.players[playerId]?.teamId)
          .filter((teamId): teamId is string => teamId !== null)
      )
    );
    const roundBoards = normalizedRoom.sharedTeamBoards[roundKey] ?? {};
    const allTeamsSubmitted = connectedTeamIds.every((teamId) => Boolean(roundBoards[teamId]?.submittedAt));

    return allTeamsSubmitted || expired;
  }

  const allSubmitted = playerIds.every((playerId) => Boolean(roundSubmissions[playerId]));

  return allSubmitted || expired;
}

export function forceRoomProgress(room: RoomState, now: number): RoomState {
  if (!shouldAdvance(room, now)) {
    return room;
  }

  let nextRoom = cloneRoom(room);
  const roundKey = String(nextRoom.currentRoundIndex);

  if (nextRoom.settings.gameMode === "team" && nextRoom.settings.teamMode === "shared") {
    nextRoom = ensureRoundSharedBoards(nextRoom, nextRoom.currentRoundIndex);

    for (const team of nextRoom.teams) {
      nextRoom = submitSharedBoardForTeam(nextRoom, nextRoom.currentRoundIndex, team.id, now);
    }
  }

  const roundSubmissions = nextRoom.submissions[roundKey] ?? {};

  for (const player of Object.values(nextRoom.players)) {
    if (roundSubmissions[player.id]) {
      continue;
    }

    const teamBoard =
      player.teamId !== null && nextRoom.settings.gameMode === "team" && nextRoom.settings.teamMode === "shared"
        ? nextRoom.sharedTeamBoards[roundKey]?.[player.teamId]
        : null;

    roundSubmissions[player.id] = {
      score: teamBoard?.score ?? 0,
      finishedAt: now,
      clearTimeMs: teamBoard?.clearTimeMs ?? null
    };
    player.roundScores[roundKey] = teamBoard?.score ?? 0;
  }

  nextRoom.submissions[roundKey] = roundSubmissions;
  nextRoom.nextRoundVotes = {};
  nextRoom.teamPointers = {};

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

  const nextRoom: RoomState = {
    ...normalizedRoom,
    phase: "playing",
    currentRoundIndex: normalizedRoom.currentRoundIndex + 1,
    roundStartedAt: now,
    nextRoundVotes: {},
    teamPointers: {}
  };

  return normalizedRoom.settings.gameMode === "team" && normalizedRoom.settings.teamMode === "shared"
    ? ensureRoundSharedBoards(nextRoom, nextRoom.currentRoundIndex)
    : nextRoom;
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
  touchPlayer(nextRoom, playerId, now);
  nextRoom.nextRoundVotes[playerId] = true;

  const playerIds = getConsensusPlayerIds(nextRoom, now);
  const everyoneAgreed = playerIds.every((id) => nextRoom.nextRoundVotes[id] === true);

  if (!everyoneAgreed) {
    return nextRoom;
  }

  const nextPlayingRoom: RoomState = {
    ...nextRoom,
    phase: "playing",
    currentRoundIndex: nextRoom.currentRoundIndex + 1,
    roundStartedAt: now,
    nextRoundVotes: {},
    teamPointers: {}
  };

  return nextRoom.settings.gameMode === "team" && nextRoom.settings.teamMode === "shared"
    ? ensureRoundSharedBoards(nextPlayingRoom, nextPlayingRoom.currentRoundIndex)
    : nextPlayingRoom;
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
  touchPlayer(nextRoom, playerId, now);
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
  delete nextRoom.teamPointers[playerId];

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
