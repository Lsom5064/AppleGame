import { PRESENCE_STALE_MS } from "../constants";
import type { PlayerState, RoomState } from "../types";

export function isPlayerConnected(player: PlayerState, now = Date.now()): boolean {
  return player.connected && now - player.lastSeenAt <= PRESENCE_STALE_MS;
}

export function getConnectedPlayerIds(room: RoomState, now = Date.now()): string[] {
  return Object.values(room.players)
    .filter((player) => isPlayerConnected(player, now))
    .map((player) => player.id);
}

export function countConnectedPlayers(room: RoomState, now = Date.now()): number {
  return getConnectedPlayerIds(room, now).length;
}
