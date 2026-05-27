export type LeaderboardMode = "sum" | "best";
export type RoomPhase = "lobby" | "playing" | "between-rounds" | "finished";

export interface RoomAccessSettings {
  password: string | null;
  isPublic: boolean;
}

export interface GameSettings {
  roundCount: 1 | 3 | 5;
  leaderboardMode: LeaderboardMode;
  roundDurationSec: number;
}

export interface RoundSubmission {
  score: number;
  finishedAt: number;
  clearTimeMs: number | null;
}

export interface RoomChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export interface PlayerState {
  id: string;
  nickname: string;
  joinedAt: number;
  isHost: boolean;
  roundScores: Record<string, number>;
}

export interface RoomState {
  code: string;
  name: string;
  hostId: string;
  seed: string;
  createdAt: number;
  phase: RoomPhase;
  settings: GameSettings;
  access: RoomAccessSettings;
  currentRoundIndex: number;
  roundStartedAt: number | null;
  players: Record<string, PlayerState>;
  submissions: Record<string, Record<string, RoundSubmission>>;
  chatMessages: RoomChatMessage[];
}

export interface SessionState {
  roomCode: string;
  playerId: string;
}

export interface RoomDirectoryEntry {
  roomCode: string;
  roomName: string;
  hostNickname: string;
  playerCount: number;
  createdAt: number;
  phase: RoomPhase;
  roundCount: GameSettings["roundCount"];
  leaderboardMode: LeaderboardMode;
  isPublic: boolean;
  requiresPassword: boolean;
}

export interface RoomDirectoryState {
  status: "loading" | "ready";
  rooms: RoomDirectoryEntry[];
}

export interface CreateRoomOptions {
  name: string;
  password: string;
  isPublic: boolean;
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  isHost: boolean;
  roundScores: number[];
  clearTimes: Array<number | null>;
  finalScore: number;
  joinedAt: number;
}

export interface Apple {
  id: string;
  column: number;
  row: number;
  width: number;
  height: number;
  x: number;
  y: number;
  value: number;
  dropping: boolean;
  dropDirection: -1 | 1;
  removed: boolean;
}

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
