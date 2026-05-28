import type { PlayerState, TeamState } from "../types";

export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 6;

export function clampTeamCount(teamCount: number): number {
  return Math.max(MIN_TEAM_COUNT, Math.min(MAX_TEAM_COUNT, Math.trunc(teamCount)));
}

export function createTeamId(index: number): string {
  return `team-${index + 1}`;
}

export function createTeams(teamCount: number): TeamState[] {
  return Array.from({ length: clampTeamCount(teamCount) }, (_, index) => ({
    id: createTeamId(index),
    name: `${index + 1}팀`
  }));
}

export function isValidTeamId(teams: TeamState[], teamId: string | null | undefined): boolean {
  return teamId !== null && teamId !== undefined && teams.some((team) => team.id === teamId);
}

export function getTeamName(teams: TeamState[], teamId: string | null | undefined): string {
  if (!teamId) {
    return "미배정";
  }

  return teams.find((team) => team.id === teamId)?.name ?? "미배정";
}

export function sortPlayersByJoinOrder(players: Record<string, PlayerState>): PlayerState[] {
  return Object.values(players).sort((left, right) => left.joinedAt - right.joinedAt);
}
