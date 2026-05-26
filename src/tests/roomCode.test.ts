import { describe, expect, it } from "vitest";
import { generateRoomCode } from "../utils/roomCode";

describe("generateRoomCode", () => {
  it("creates a 6-character uppercase room code", () => {
    let pointer = 0;
    const randomValues = [0.01, 0.2, 0.4, 0.55, 0.77, 0.91];
    const code = generateRoomCode(() => randomValues[pointer++ % randomValues.length]);

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
  });
});
