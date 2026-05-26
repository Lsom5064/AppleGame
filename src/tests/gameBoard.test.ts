import { describe, expect, it } from "vitest";
import { APPLE_COUNT, APPLE_PADDING, BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import { generateApples } from "../utils/gameBoard";

describe("generateApples", () => {
  it("returns a deterministic board for the same seed", () => {
    const left = generateApples("room-seed:0");
    const right = generateApples("room-seed:0");

    expect(left).toEqual(right);
  });

  it("returns a different board for a different round seed", () => {
    const left = generateApples("room-seed:0");
    const right = generateApples("room-seed:1");

    expect(left).not.toEqual(right);
  });

  it("keeps apples inside the board with valid values", () => {
    const apples = generateApples("room-seed:2");

    expect(apples).toHaveLength(APPLE_COUNT);

    for (const apple of apples) {
      expect(apple.value).toBeGreaterThanOrEqual(1);
      expect(apple.value).toBeLessThanOrEqual(9);
      expect(apple.x).toBeGreaterThanOrEqual(APPLE_PADDING);
      expect(apple.x).toBeLessThanOrEqual(BOARD_WIDTH - APPLE_PADDING);
      expect(apple.y).toBeGreaterThanOrEqual(APPLE_PADDING);
      expect(apple.y).toBeLessThanOrEqual(BOARD_HEIGHT - APPLE_PADDING);
      expect(apple.removed).toBe(false);
    }
  });
});
