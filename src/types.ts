export type LeaderboardMode = "sum" | "best";
export type RoomPhase = "lobby" | "playing" | "finished";

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

export interface PlayerState {
  id: string;
  nickname: string;
  joinedAt: number;
  isHost: boolean;
  roundScores: Record<string, number>;
}

export interface RoomState {
  code: string;
  hostId: string;
  seed: string;
  createdAt: number;
  phase: RoomPhase;
  settings: GameSettings;
  currentRoundIndex: number;
  roundStartedAt: number | null;
  players: Record<string, PlayerState>;
  submissions: Record<string, Record<string, RoundSubmission>>;
}

export interface SessionState {
  roomCode: string;
  playerId: string;
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
  x: number;
  y: number;
  value: number;
  removed: boolean;
}

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
