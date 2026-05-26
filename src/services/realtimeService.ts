import { get, onValue, ref, runTransaction, set } from "firebase/database";
import { firebaseDatabase } from "../lib/firebase";
import type { RoomState } from "../types";
import {
  createInitialRoom,
  createNewRoomCode,
  forceRoomProgress,
  joinRoom,
  leaveRoom,
  normalizeRoomState,
  startRoomGame,
  submitRoundScore,
  updateRoomSettings
} from "../utils/roomMutations";

interface RealtimeService {
  providerName: "firebase" | "local";
  createRoom(nickname: string, playerId: string): Promise<string>;
  joinRoom(roomCode: string, nickname: string, playerId: string): Promise<void>;
  subscribeToRoom(roomCode: string, callback: (room: RoomState | null) => void): () => void;
  updateSettings(
    roomCode: string,
    playerId: string,
    settings: Partial<Pick<RoomState["settings"], "roundCount" | "leaderboardMode">>
  ): Promise<void>;
  startGame(roomCode: string, playerId: string): Promise<void>;
  submitRoundScore(roomCode: string, playerId: string, roundIndex: number, score: number): Promise<void>;
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

function createFirebaseService(): RealtimeService {
  if (!firebaseDatabase) {
    throw new Error("Firebase is not configured.");
  }

  const database = firebaseDatabase;

  return {
    providerName: "firebase",
    async createRoom(nickname, playerId) {
      const roomsRef = ref(database, "rooms");
      const snapshot = await get(roomsRef);
      const existingCodes = snapshot.exists() ? Object.keys(snapshot.val() as Record<string, unknown>) : [];
      const roomCode = createNewRoomCode(existingCodes);
      const room = createInitialRoom(roomCode, playerId, nickname, Date.now());
      await set(ref(database, getRoomPath(roomCode)), room);
      return roomCode;
    },
    async joinRoom(roomCode, nickname, playerId) {
      const roomRef = ref(database, getRoomPath(roomCode));
      await runTransaction(roomRef, (current) => {
        const room = current as RoomState | null;
        return joinRoom(requireRoom(room), playerId, nickname, Date.now());
      });
    },
    subscribeToRoom(roomCode, callback) {
      const roomRef = ref(database, getRoomPath(roomCode));
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const nextRoom = (snapshot.val() as RoomState | null) ?? null;
        callback(nextRoom ? normalizeRoomState(nextRoom) : null);
      });
      return unsubscribe;
    },
    async updateSettings(roomCode, playerId, settings) {
      const roomRef = ref(database, getRoomPath(roomCode));
      await runTransaction(roomRef, (current) => {
        const room = current as RoomState | null;
        return updateRoomSettings(requireRoom(room), playerId, settings);
      });
    },
    async startGame(roomCode, playerId) {
      const roomRef = ref(database, getRoomPath(roomCode));
      await runTransaction(roomRef, (current) => {
        const room = current as RoomState | null;
        return startRoomGame(requireRoom(room), playerId, Date.now());
      });
    },
    async submitRoundScore(roomCode, playerId, roundIndex, score) {
      const roomRef = ref(database, getRoomPath(roomCode));
      await runTransaction(roomRef, (current) => {
        const room = current as RoomState | null;
        return submitRoundScore(requireRoom(room), playerId, roundIndex, score, Date.now());
      });
    },
    async forceRoundProgress(roomCode) {
      const roomRef = ref(database, getRoomPath(roomCode));
      await runTransaction(roomRef, (current) => {
        const room = current as RoomState | null;
        return forceRoomProgress(requireRoom(room), Date.now());
      });
    },
    async leaveRoom(roomCode, playerId) {
      const roomRef = ref(database, getRoomPath(roomCode));
      await runTransaction(roomRef, (current) => {
        const room = current as RoomState | null;
        return leaveRoom(requireRoom(room), playerId);
      });
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

  return {
    providerName: "local",
    async createRoom(nickname, playerId) {
      const roomCode = createNewRoomCode(listExistingCodes());
      persistRoom(roomCode, createInitialRoom(roomCode, playerId, nickname, Date.now()));
      return roomCode;
    },
    async joinRoom(roomCode, nickname, playerId) {
      withRoom(roomCode, (room) => joinRoom(requireRoom(room), playerId, nickname, Date.now()));
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
    async updateSettings(roomCode, playerId, settings) {
      withRoom(roomCode, (room) => updateRoomSettings(requireRoom(room), playerId, settings));
    },
    async startGame(roomCode, playerId) {
      withRoom(roomCode, (room) => startRoomGame(requireRoom(room), playerId, Date.now()));
    },
    async submitRoundScore(roomCode, playerId, roundIndex, score) {
      withRoom(roomCode, (room) => submitRoundScore(requireRoom(room), playerId, roundIndex, score, Date.now()));
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
