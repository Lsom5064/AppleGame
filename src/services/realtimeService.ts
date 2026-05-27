import { get, onValue, ref, runTransaction, set } from "firebase/database";
import { firebaseDatabase } from "../lib/firebase";
import type { NearbyRoomSummary, NearbyRoomsState, RoomState } from "../types";
import { getNetworkFingerprint } from "../utils/networkFingerprint";
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
  createRoom(nickname: string, playerId: string): Promise<string>;
  joinRoom(roomCode: string, nickname: string, playerId: string): Promise<void>;
  subscribeToRoom(roomCode: string, callback: (room: RoomState | null) => void): () => void;
  subscribeToNearbyRooms(callback: (state: NearbyRoomsState) => void): () => void;
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
  publishLobbyRoom(room: RoomState): Promise<void>;
  clearLobbyRoom(roomCode: string): Promise<void>;
}

interface NearbyRoomAnnouncement extends NearbyRoomSummary {
  hostId: string;
  expiresAt: number;
  updatedAt: number;
}

const NEARBY_ROOM_TTL_MS = 30_000;

function getRoomPath(roomCode: string): string {
  return `rooms/${roomCode}`;
}

function getNearbyRoomsPath(networkFingerprint: string): string {
  return `nearbyRooms/${networkFingerprint}`;
}

function getPublicNearbyRoomsPath(): string {
  return "nearbyRoomsPublic";
}

function createNearbyRoomSummary(room: RoomState): NearbyRoomSummary {
  const host = room.players[room.hostId];

  if (!host) {
    throw new Error("방장 정보를 찾을 수 없습니다.");
  }

  return {
    roomCode: room.code,
    hostNickname: host.nickname,
    playerCount: Object.keys(room.players).length,
    createdAt: room.createdAt,
    roundCount: room.settings.roundCount,
    leaderboardMode: room.settings.leaderboardMode
  };
}

function requireRoom(room: RoomState | null): RoomState {
  if (!room) {
    throw new Error("방을 찾을 수 없습니다.");
  }

  return normalizeRoomState(room);
}

function readAnnouncements(snapshotValue: Record<string, NearbyRoomAnnouncement> | null): NearbyRoomSummary[] {
  const announcements = snapshotValue ?? {};
  const now = Date.now();

  return Object.values(announcements)
    .filter((announcement) => announcement.expiresAt > now)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(({ hostId: _hostId, expiresAt: _expiresAt, updatedAt: _updatedAt, ...room }) => room);
}

function mergeNearbyRoomLists(networkRooms: NearbyRoomSummary[], publicRooms: NearbyRoomSummary[]): NearbyRoomSummary[] {
  const dedupedRooms = new Map<string, NearbyRoomSummary>();

  for (const room of networkRooms) {
    dedupedRooms.set(room.roomCode, room);
  }

  for (const room of publicRooms) {
    if (!dedupedRooms.has(room.roomCode)) {
      dedupedRooms.set(room.roomCode, room);
    }
  }

  return Array.from(dedupedRooms.values()).sort((left, right) => right.createdAt - left.createdAt);
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
      await runRoomTransaction(database, roomCode, (room) => joinRoom(room, playerId, nickname, Date.now()));
    },
    subscribeToRoom(roomCode, callback) {
      const roomRef = ref(database, getRoomPath(roomCode));
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const nextRoom = (snapshot.val() as RoomState | null) ?? null;
        callback(nextRoom ? normalizeRoomState(nextRoom) : null);
      });
      return unsubscribe;
    },
    subscribeToNearbyRooms(callback) {
      let disposed = false;
      let unsubscribeFromPublic: (() => void) | null = null;
      let unsubscribeFromNetwork: (() => void) | null = null;
      let publicRooms: NearbyRoomSummary[] = [];
      let networkRooms: NearbyRoomSummary[] = [];
      let hasResolvedPublicRooms = false;

      callback({ status: "loading", rooms: [] });

      const emit = () => {
        if (disposed || !hasResolvedPublicRooms) {
          return;
        }

        callback({
          status: "ready",
          rooms: mergeNearbyRoomLists(networkRooms, publicRooms)
        });
      };

      unsubscribeFromPublic = onValue(ref(database, getPublicNearbyRoomsPath()), (snapshot) => {
        publicRooms = readAnnouncements(snapshot.val() as Record<string, NearbyRoomAnnouncement> | null);
        hasResolvedPublicRooms = true;
        emit();
      });

      void getNetworkFingerprint()
        .then((networkFingerprint) => {
          if (disposed || !networkFingerprint) {
            emit();
            return;
          }

          const nearbyRoomsRef = ref(database, getNearbyRoomsPath(networkFingerprint));
          unsubscribeFromNetwork = onValue(nearbyRoomsRef, (snapshot) => {
            networkRooms = readAnnouncements(snapshot.val() as Record<string, NearbyRoomAnnouncement> | null);
            emit();
          });
        })
        .catch(() => {
          emit();
        });

      return () => {
        disposed = true;
        unsubscribeFromPublic?.();
        unsubscribeFromNetwork?.();
      };
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
    },
    async publishLobbyRoom(room) {
      if (room.phase !== "lobby") {
        return;
      }

      const summary = createNearbyRoomSummary(room);
      const timestamp = Date.now();
      const announcement: NearbyRoomAnnouncement = {
        ...summary,
        hostId: room.hostId,
        expiresAt: timestamp + NEARBY_ROOM_TTL_MS,
        updatedAt: timestamp
      };

      await set(ref(database, `${getPublicNearbyRoomsPath()}/${room.code}`), announcement);

      const networkFingerprint = await getNetworkFingerprint();
      if (!networkFingerprint) {
        return;
      }

      await set(ref(database, `${getNearbyRoomsPath(networkFingerprint)}/${room.code}`), announcement);
    },
    async clearLobbyRoom(roomCode) {
      await set(ref(database, `${getPublicNearbyRoomsPath()}/${roomCode}`), null);

      const networkFingerprint = await getNetworkFingerprint();
      if (!networkFingerprint) {
        return;
      }

      await set(ref(database, `${getNearbyRoomsPath(networkFingerprint)}/${roomCode}`), null);
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

  function listNearbyRooms(): NearbyRoomSummary[] {
    return listExistingCodes()
      .map((roomCode) => loadRoom(roomCode))
      .filter((room): room is RoomState => room !== null && room.phase === "lobby")
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((room) => createNearbyRoomSummary(room));
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
    subscribeToNearbyRooms(callback) {
      const emit = () => {
        callback({
          status: "ready",
          rooms: listNearbyRooms()
        });
      };

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
    },
    async publishLobbyRoom(_room) {
      return;
    },
    async clearLobbyRoom(_roomCode) {
      return;
    }
  };
}

export const realtimeService: RealtimeService = firebaseDatabase
  ? createFirebaseService()
  : createLocalService();
