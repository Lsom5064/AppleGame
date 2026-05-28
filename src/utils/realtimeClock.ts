let realtimeClockOffsetMs = 0;

export function setRealtimeClockOffset(offsetMs: number): void {
  realtimeClockOffsetMs = Number.isFinite(offsetMs) ? offsetMs : 0;
}

export function getRealtimeClockOffset(): number {
  return realtimeClockOffsetMs;
}

export function getRealtimeNow(): number {
  return Date.now() + realtimeClockOffsetMs;
}
