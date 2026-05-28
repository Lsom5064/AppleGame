import { PRESENCE_STALE_MS } from "../constants";
import type { PlayerState, RoomState } from "../types";
import { getRealtimeNow } from "./realtimeClock";

export function isPlayerConnected(player: PlayerState, now = getRealtimeNow()): boolean {
  return player.connected && now - player.lastSeenAt <= PRESENCE_STALE_MS;
}

export function getConnectedPlayerIds(room: RoomState, now = getRealtimeNow()): string[] {
  return Object.values(room.players)
    .filter((player) => isPlayerConnected(player, now))
    .map((player) => player.id);
}

export function countConnectedPlayers(room: RoomState, now = getRealtimeNow()): number {
  return getConnectedPlayerIds(room, now).length;
}
