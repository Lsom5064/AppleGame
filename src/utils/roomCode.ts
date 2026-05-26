const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(random: () => number): string {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    const charIndex = Math.floor(random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[charIndex];
  }

  return code;
}
