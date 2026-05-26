import type { LeaderboardEntry, PlayerState, RoomState } from "../types";

function getRoundScore(player: PlayerState, roundIndex: number): number {
  return player.roundScores[String(roundIndex)] ?? 0;
}

function getFinalScore(entry: LeaderboardEntry, mode: RoomState["settings"]["leaderboardMode"]): number {
  if (mode === "best") {
    return Math.max(0, ...entry.roundScores);
  }

  return entry.roundScores.reduce((sum, score) => sum + score, 0);
}

export function buildLeaderboard(room: RoomState): LeaderboardEntry[] {
  const roundCount = room.settings.roundCount;
  const entries = Object.values(room.players).map((player) => {
    const roundScores = Array.from({ length: roundCount }, (_, roundIndex) =>
      getRoundScore(player, roundIndex)
    );

    const baseEntry: LeaderboardEntry = {
      id: player.id,
      nickname: player.nickname,
      isHost: player.isHost,
      roundScores,
      finalScore: 0,
      joinedAt: player.joinedAt
    };

    return {
      ...baseEntry,
      finalScore: getFinalScore(baseEntry, room.settings.leaderboardMode)
    };
  });

  return entries.sort((left, right) => {
    if (right.finalScore !== left.finalScore) {
      return right.finalScore - left.finalScore;
    }

    const leftTotal = left.roundScores.reduce((sum, score) => sum + score, 0);
    const rightTotal = right.roundScores.reduce((sum, score) => sum + score, 0);

    if (rightTotal !== leftTotal) {
      return rightTotal - leftTotal;
    }

    return left.joinedAt - right.joinedAt;
  });
}
