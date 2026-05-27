import { get, onValue, ref, runTransaction, set } from "firebase/database";
import { firebaseDatabase } from "../lib/firebase";
import type { CreateRoomOptions, RoomDirectoryEntry, RoomDirectoryState, RoomState } from "../types";
import {
  createInitialRoom,
  createNewRoomCode,
  forceRoomProgress,
  joinRoom,
  leaveRoom,
  normalizeRoomState,
  startNextRound,
  startRoomGame,
  submitRoundScore,
  updateRoomSettings
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
    settings: Partial<Pick<RoomState["settings"], "roundCount" | "leaderboardMode">>
  ): Promise<void>;
  startGame(roomCode: string, playerId: string): Promise<void>;
  startNextRound(roomCode: string, playerId: string): Promise<void>;
  submitRoundScore(
    roomCode: string,
    playerId: string,
    roundIndex: number,
    score: number,
    clearTimeMs: number | null
  ): Promise<void>;
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
    playerCount: Object.keys(normalizedRoom.players).length,
    createdAt: normalizedRoom.createdAt,
    phase: normalizedRoom.phase,
    roundCount: normalizedRoom.settings.roundCount,
    leaderboardMode: normalizedRoom.settings.leaderboardMode,
    isPublic: normalizedRoom.access.isPublic,
    requiresPassword: Boolean(normalizedRoom.access.password)
  };
}

function createRoomDirectoryState(roomsByCode: Record<string, RoomState> | null): RoomDirectoryState {
  const rooms = Object.values(roomsByCode ?? {})
    .filter((room) => {
      try {
        const normalizedRoom = normalizeRoomState(room);
        return normalizedRoom.phase === "lobby" && Object.keys(normalizedRoom.players).length > 0;
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

  return {
    providerName: "firebase",
    async createRoom(nickname, playerId, options) {
      const roomsRef = ref(database, "rooms");
      const snapshot = await get(roomsRef);
      const existingCodes = snapshot.exists() ? Object.keys(snapshot.val() as Record<string, unknown>) : [];
      const roomCode = createNewRoomCode(existingCodes);
      const room = createInitialRoom(roomCode, playerId, nickname, Date.now(), options);
      await set(ref(database, getRoomPath(roomCode)), room);
      return roomCode;
    },
    async joinRoom(roomCode, nickname, playerId, password) {
      await runRoomTransaction(database, roomCode, (room) =>
        joinRoom(room, playerId, nickname, Date.now(), password)
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
    async startGame(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) => startRoomGame(room, playerId, Date.now()));
    },
    async startNextRound(roomCode, playerId) {
      await runRoomTransaction(database, roomCode, (room) => startNextRound(room, playerId, Date.now()));
    },
    async submitRoundScore(roomCode, playerId, roundIndex, score, clearTimeMs) {
      await runRoomTransaction(database, roomCode, (room) =>
        submitRoundScore(room, playerId, roundIndex, score, clearTimeMs, Date.now())
      );
    },
    async forceRoundProgress(roomCode) {
      await runRoomTransaction(database, roomCode, (room) => forceRoomProgress(room, Date.now()));
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
          room !== null && room.phase === "lobby" && Object.keys(room.players).length > 0
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
    async startGame(roomCode, playerId) {
      withRoom(roomCode, (room) => startRoomGame(requireRoom(room), playerId, Date.now()));
    },
    async startNextRound(roomCode, playerId) {
      withRoom(roomCode, (room) => startNextRound(requireRoom(room), playerId, Date.now()));
    },
    async submitRoundScore(roomCode, playerId, roundIndex, score, clearTimeMs) {
      withRoom(roomCode, (room) =>
        submitRoundScore(requireRoom(room), playerId, roundIndex, score, clearTimeMs, Date.now())
      );
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
