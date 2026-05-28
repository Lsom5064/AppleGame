import { get, onValue, ref, runTransaction, set, update } from "firebase/database";
import { firebaseDatabase } from "../lib/firebase";
import type { CreateRoomOptions, RoomDirectoryEntry, RoomDirectoryState, RoomState } from "../types";
import { countConnectedPlayers } from "../utils/presence";
import { getRealtimeNow, setRealtimeClockOffset } from "../utils/realtimeClock";
import {
  addRoomChatMessage,
  applySharedTeamSelection,
  assignRoomPlayerTeam,
  clearTeamPointer,
  createInitialRoom,
  createNewRoomCode,
  forceRoomProgress,
  joinRoom,
  leaveRoom,
  normalizeRoomState,
  randomizeRoomTeams,
  startNextRound,
  startRoomGame,
  submitRoundScore,
  updatePlayerPresence,
  updateTeamPointer,
  updateRoomSettings,
  voteForNextRound
} from "../utils/roomMutations";

interface RealtimeService {
  providerName: "firebase" | "local";
  createRoom(nickname: string, playerId: string, options: CreateRoomOptions): Promise<string>;
  joinRoom(roomCode: string, nickname: string, playerId: string, password?: string): Promise<void>;
  subscribeToRoom(roomCode: string, callback: (room: RoomState | null) => void): () => void;
  subscribeToRoomDirectory(callback: (state: RoomDirectoryState) => void): () => void;
  updateSettings(
    roomCode: string,
    playerId: string,
    settings: Partial<
      Pick<RoomState["settings"], "roundCount" | "leaderboardMode" | "gameMode" | "teamMode" | "teamCount">
    >
  ): Promise<void>;
  randomizeTeams(roomCode: string, playerId: string): Promise<void>;
  assignPlayerTeam(roomCode: string, playerId: string, targetPlayerId: string, teamId: string): Promise<void>;
  startGame(roomCode: string, playerId: string): Promise<void>;
  startNextRound(roomCode: string, playerId: string): Promise<void>;
  voteForNextRound(roomCode: string, playerId: string): Promise<void>;
  submitRoundScore(
    roomCode: string,
    playerId: string,
    roundIndex: number,
    score: number,
    clearTimeMs: number | null
  ): Promise<void>;
  submitSharedSelection(
    roomCode: string,
    playerId: string,
    roundIndex: number,
    appleIds: string[],
    clearTimeMs: number | null
  ): Promise<void>;
  updatePresence(roomCode: string, playerId: string, connected: boolean): Promise<void>;
  updateTeamPointer(
    roomCode: string,
    playerId: string,
    roundIndex: number,
    x: number,
    y: number,
    active: boolean,
    dragging?: boolean,
    selectionStartX?: number,
    selectionStartY?: number
  ): Promise<void>;
  sendChatMessage(roomCode: string, playerId: string, text: string): Promise<void>;
  forceRoundProgress(roomCode: string): Promise<void>;
  leaveRoom(roomCode: string, playerId: string): Promise<void>;
}

function getRoomPath(roomCode: string): string {
  return `rooms/${roomCode}`;
}

function requireRoom(room: RoomState | null): RoomState {
  if (!room) {
    throw new Error("방을 찾을 수 없습니다.");
  }

  return normalizeRoomState(room);
}

function updateRealtimeClockOffset(offset: unknown): void {
  if (typeof offset === "number") {
    setRealtimeClockOffset(offset);
  }
}

function initializeFirebaseClock(database: NonNullable<typeof firebaseDatabase>): void {
  const offsetRef = ref(database, ".info/serverTimeOffset");

  void get(offsetRef)
    .then((snapshot) => updateRealtimeClockOffset(snapshot.val()))
    .catch(() => {});

  onValue(offsetRef, (snapshot) => updateRealtimeClockOffset(snapshot.val()));
}

function createRoomDirectoryEntry(room: RoomState): RoomDirectoryEntry {
  const normalizedRoom = normalizeRoomState(room);
  const host = normalizedRoom.players[normalizedRoom.hostId];

  if (!host) {
    throw new Error("방장 정보를 찾을 수 없습니다.");
  }

  return {
    roomCode: normalizedRoom.code,
    roomName: normalizedRoom.name,
    hostNickname: host.nickname,
    playerCount: countConnectedPlayers(normalizedRoom) || Object.keys(normalizedRoom.players).length,
    createdAt: normalizedRoom.createdAt,
    phase: normalizedRoom.phase,
    roundCount: normalizedRoom.settings.roundCount,
    leaderboardMode: normalizedRoom.settings.leaderboardMode,
    gameMode: normalizedRoom.settings.gameMode,
    teamMode: normalizedRoom.settings.teamMode,
    teamCount: normalizedRoom.settings.teamCount,
    isPublic: normalizedRoom.access.isPublic,
    requiresPassword: Boolean(normalizedRoom.access.password)
  };
}

function createRoomDirectoryState(roomsByCode: Record<string, RoomState> | null): RoomDirectoryState {
  const rooms = Object.values(roomsByCode ?? {})
    .filter((room) => {
      try {
        const normalizedRoom = normalizeRoomState(room);
        return normalizedRoom.phase === "lobby" && countConnectedPlayers(normalizedRoom) > 0;
      } catch {
        return false;
      }
    })
    .flatMap((room) => {
      try {
        return [createRoomDirectoryEntry(room)];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.createdAt - left.createdAt);

  return {
    status: "ready",
    rooms
  };
}

async function runRoomTransaction(
  database: NonNullable<typeof firebaseDatabase>,
  roomCode: string,
  updater: (room: RoomState) => RoomState | null
): Promise<void> {
  const roomRef = ref(database, getRoomPath(roomCode));
  const snapshot = await get(roomRef);
  const fallbackRoom = requireRoom((snapshot.val() as RoomState | null) ?? null);

  await runTransaction(roomRef, (current) => updater(requireRoom((current as RoomState | null) ?? fallbackRoom)));
}

function createFirebaseService(): RealtimeService {
  if (!firebaseDatabase) {
    throw new Error("Firebase is not configured.");
  }

  const database = firebaseDatabase;
  const now = () => getRealtimeNow();
  initializeFirebaseClock(database);

  return {
    providerName: "firebase",
    async createRoom(nickname, playerId, options) {
      const roomsRef = ref(database, "rooms");
      const snapshot = await get(roomsRef);
      const existingCodes = snapshot.exists() ? Object.keys(snapshot.val() as Record<string, unknown>) : [];
      const roomCode = createNewRoomCode(existingCodes);
      const room = createInitialRoom(roomCode, playerId, nickname, now(), options);
      await set(ref(database, getRoomPath(roomCode)), room);
      return roomCode;
    },
    async joinRoom(roomCode, nickname, playerId, password) {
      await runRoomTransaction(database, roomCode, (room) =>
        joinRoom(room, playerId, nickname, now(), password)
      );
    },
    subscribeToRoom(roomCode, callback) {
      const roomRef = ref(database, getRoomPath(roomCode));
      return onValue(roomRef, (snapshot) => {
        const nextRoom = (snapshot.val() as RoomState | null) ?? null;
        callback(nextRoom ? normalizeRoomState(nextRoom) : null);
      });
    },
    subscribeToRoomDirectory(callback) {
      callback({ status: "loading", rooms: [] });
      const roomsRef = ref(database, "rooms");

      return onValue(roomsRef, (snapshot) => {
        callback(createRoomDirectoryState((snapshot.val() as Record<string, RoomState> | null) ?? null));
      });
    },
    async updateSettings(roomCode, playerId, settings) {
      await runRoomTransaction(database, roomCode, (room) => updateRoomSettings(room, playerId, settings));
    },
    async randomizeTeams(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) =>
        randomizeRoomTeams(room, playerId, now())
      );
    },
    async assignPlayerTeam(roomCode, playerId, targetPlayerId, teamId) {
      await runRoomTransaction(database, roomCode, (room) =>
        assignRoomPlayerTeam(room, playerId, targetPlayerId, teamId)
      );
    },
    async startGame(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) => startRoomGame(room, playerId, now()));
    },
    async startNextRound(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) => startNextRound(room, playerId, now()));
    },
    async voteForNextRound(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) => voteForNextRound(room, playerId, now()));
    },
    async submitRoundScore(roomCode, playerId, roundIndex, score, clearTimeMs) {
      await runRoomTransaction(database, roomCode, (room) =>
        submitRoundScore(room, playerId, roundIndex, score, clearTimeMs, now())
      );
    },
    async submitSharedSelection(roomCode, playerId, roundIndex, appleIds, clearTimeMs) {
      await runRoomTransaction(database, roomCode, (room) =>
        applySharedTeamSelection(room, playerId, roundIndex, appleIds, clearTimeMs, now())
      );
    },
    async updatePresence(roomCode, playerId, connected) {
      await runRoomTransaction(database, roomCode, (room) =>
        updatePlayerPresence(room, playerId, connected, now())
      );
    },
    async updateTeamPointer(roomCode, playerId, roundIndex, x, y, active, dragging, selectionStartX, selectionStartY) {
      const roomRef = ref(database, getRoomPath(roomCode));
      const snapshot = await get(roomRef);
      const room = requireRoom((snapshot.val() as RoomState | null) ?? null);
      const timestamp = now();
      const nextRoom = active
        ? updateTeamPointer(
            room,
            playerId,
            roundIndex,
            x,
            y,
            active,
            timestamp,
            dragging,
            selectionStartX,
            selectionStartY
          )
        : clearTeamPointer(room, playerId);

      if (!nextRoom.players[playerId]) {
        return;
      }

      await update(ref(database, getRoomPath(roomCode)), {
        [`teamPointers/${playerId}`]: nextRoom.teamPointers[playerId] ?? null,
        [`players/${playerId}/connected`]: true,
        [`players/${playerId}/lastSeenAt`]: timestamp
      });
    },
    async sendChatMessage(roomCode, playerId, text) {
      await runRoomTransaction(database, roomCode, (room) => addRoomChatMessage(room, playerId, text, now()));
    },
    async forceRoundProgress(roomCode) {
      await runRoomTransaction(database, roomCode, (room) => forceRoomProgress(room, now()));
    },
    async leaveRoom(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) => leaveRoom(room, playerId));
    }
  };
}

const STORAGE_PREFIX = "apple-sum-room:";
const CHANNEL_NAME = "apple-sum-room-events";

function createLocalService(): RealtimeService {
  const channel =
    typeof window !== "undefined" && "BroadcastChannel" in window
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;

  function loadRoom(roomCode: string): RoomState | null {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${roomCode}`);
    return raw ? normalizeRoomState(JSON.parse(raw) as RoomState) : null;
  }

  function persistRoom(roomCode: string, room: RoomState | null): void {
    if (typeof window === "undefined") {
      return;
    }

    const key = `${STORAGE_PREFIX}${roomCode}`;

    if (room) {
      window.localStorage.setItem(key, JSON.stringify(room));
    } else {
      window.localStorage.removeItem(key);
    }

    channel?.postMessage({ roomCode });
  }

  function withRoom(roomCode: string, updater: (room: RoomState | null) => RoomState | null): void {
    const nextRoom = updater(loadRoom(roomCode));
    persistRoom(roomCode, nextRoom);
  }

  function listExistingCodes(): string[] {
    if (typeof window === "undefined") {
      return [];
    }

    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .map((key) => key.replace(STORAGE_PREFIX, ""));
  }

  function listDirectoryRooms(): RoomDirectoryEntry[] {
    return listExistingCodes()
      .map((roomCode) => loadRoom(roomCode))
      .filter(
        (room): room is RoomState =>
          room !== null && room.phase === "lobby" && countConnectedPlayers(room) > 0
      )
      .map((room) => createRoomDirectoryEntry(room))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  return {
    providerName: "local",
    async createRoom(nickname, playerId, options) {
      const roomCode = createNewRoomCode(listExistingCodes());
      persistRoom(roomCode, createInitialRoom(roomCode, playerId, nickname, Date.now(), options));
      return roomCode;
    },
    async joinRoom(roomCode, nickname, playerId, password) {
      withRoom(roomCode, (room) => joinRoom(requireRoom(room), playerId, nickname, Date.now(), password));
    },
    subscribeToRoom(roomCode, callback) {
      callback(loadRoom(roomCode));

      const handleStorage = (event: StorageEvent) => {
        if (event.key === `${STORAGE_PREFIX}${roomCode}`) {
          callback(loadRoom(roomCode));
        }
      };

      const handleMessage = (event: MessageEvent<{ roomCode?: string }>) => {
        if (event.data.roomCode === roomCode) {
          callback(loadRoom(roomCode));
        }
      };

      window.addEventListener("storage", handleStorage);
      channel?.addEventListener("message", handleMessage);

      return () => {
        window.removeEventListener("storage", handleStorage);
        channel?.removeEventListener("message", handleMessage);
      };
    },
    subscribeToRoomDirectory(callback) {
      const emit = () => {
        callback({
          status: "ready",
          rooms: listDirectoryRooms()
        });
      };

      callback({ status: "loading", rooms: [] });
      emit();

      const handleStorage = (event: StorageEvent) => {
        if (event.key?.startsWith(STORAGE_PREFIX)) {
          emit();
        }
      };

      const handleMessage = () => {
        emit();
      };

      window.addEventListener("storage", handleStorage);
      channel?.addEventListener("message", handleMessage);

      return () => {
        window.removeEventListener("storage", handleStorage);
        channel?.removeEventListener("message", handleMessage);
      };
    },
    async updateSettings(roomCode, playerId, settings) {
      withRoom(roomCode, (room) => updateRoomSettings(requireRoom(room), playerId, settings));
    },
    async randomizeTeams(roomCode, playerId) {
      withRoom(roomCode, (room) => randomizeRoomTeams(requireRoom(room), playerId, Date.now()));
    },
    async assignPlayerTeam(roomCode, playerId, targetPlayerId, teamId) {
      withRoom(roomCode, (room) =>
        assignRoomPlayerTeam(requireRoom(room), playerId, targetPlayerId, teamId)
      );
    },
    async startGame(roomCode, playerId) {
      withRoom(roomCode, (room) => startRoomGame(requireRoom(room), playerId, Date.now()));
    },
    async startNextRound(roomCode, playerId) {
      withRoom(roomCode, (room) => startNextRound(requireRoom(room), playerId, Date.now()));
    },
    async voteForNextRound(roomCode, playerId) {
      withRoom(roomCode, (room) => voteForNextRound(requireRoom(room), playerId, Date.now()));
    },
    async submitRoundScore(roomCode, playerId, roundIndex, score, clearTimeMs) {
      withRoom(roomCode, (room) =>
        submitRoundScore(requireRoom(room), playerId, roundIndex, score, clearTimeMs, Date.now())
      );
    },
    async submitSharedSelection(roomCode, playerId, roundIndex, appleIds, clearTimeMs) {
      withRoom(roomCode, (room) =>
        applySharedTeamSelection(requireRoom(room), playerId, roundIndex, appleIds, clearTimeMs, Date.now())
      );
    },
    async updatePresence(roomCode, playerId, connected) {
      withRoom(roomCode, (room) =>
        updatePlayerPresence(requireRoom(room), playerId, connected, Date.now())
      );
    },
    async updateTeamPointer(roomCode, playerId, roundIndex, x, y, active, dragging, selectionStartX, selectionStartY) {
      withRoom(roomCode, (room) => {
        const currentRoom = requireRoom(room);
        return active
          ? updateTeamPointer(
              currentRoom,
              playerId,
              roundIndex,
              x,
              y,
              active,
              Date.now(),
              dragging,
              selectionStartX,
              selectionStartY
            )
          : clearTeamPointer(currentRoom, playerId);
      });
    },
    async sendChatMessage(roomCode, playerId, text) {
      withRoom(roomCode, (room) => addRoomChatMessage(requireRoom(room), playerId, text, Date.now()));
    },
    async forceRoundProgress(roomCode) {
      withRoom(roomCode, (room) => forceRoomProgress(requireRoom(room), Date.now()));
    },
    async leaveRoom(roomCode, playerId) {
      withRoom(roomCode, (room) => leaveRoom(requireRoom(room), playerId));
    }
  };
}

export const realtimeService: RealtimeService = firebaseDatabase
  ? createFirebaseService()
  : createLocalService();
