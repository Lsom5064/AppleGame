import type { LeaderboardEntry, PlayerState, RoomState, TeamLeaderboardEntry } from "../types";

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
    const clearTimes = Array.from({ length: roundCount }, (_, roundIndex) => {
      const roundKey = String(roundIndex);
      return room.submissions[roundKey]?.[player.id]?.clearTimeMs ?? null;
    });

    const baseEntry: LeaderboardEntry = {
      id: player.id,
      nickname: player.nickname,
      isHost: player.isHost,
      roundScores,
      clearTimes,
      finalScore: 0,
      joinedAt: player.joinedAt,
      teamId: player.teamId
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

export function buildTeamLeaderboard(room: RoomState): TeamLeaderboardEntry[] {
  const playerEntries = buildLeaderboard(room);
  const teamsById = new Map(room.teams.map((team) => [team.id, team]));

  return room.teams
    .map((team) => {
      const members = playerEntries.filter((entry) => entry.teamId === team.id);
      const roundScores = Array.from({ length: room.settings.roundCount }, (_, roundIndex) => {
        if (room.settings.gameMode === "team" && room.settings.teamMode === "shared") {
          return room.sharedTeamBoards[String(roundIndex)]?.[team.id]?.score ?? 0;
        }

        return members.reduce((sum, member) => sum + member.roundScores[roundIndex], 0);
      });
      const finalScore =
        room.settings.leaderboardMode === "best"
          ? Math.max(0, ...roundScores)
          : roundScores.reduce((sum, roundScore) => sum + roundScore, 0);

      return {
        id: team.id,
        name: teamsById.get(team.id)?.name ?? team.name,
        roundScores,
        finalScore,
        members
      };
    })
    .filter((team) => team.members.length > 0)
    .sort((left, right) => {
      if (right.finalScore !== left.finalScore) {
        return right.finalScore - left.finalScore;
      }

      const leftTotal = left.roundScores.reduce((sum, score) => sum + score, 0);
      const rightTotal = right.roundScores.reduce((sum, score) => sum + score, 0);

      if (rightTotal !== leftTotal) {
        return rightTotal - leftTotal;
      }

      return left.name.localeCompare(right.name, "ko");
    });
}
