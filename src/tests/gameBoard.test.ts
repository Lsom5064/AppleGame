import { describe, expect, it } from "vitest";
import {
  APPLE_COUNT,
  APPLE_PADDING,
  BOARD_GRID_COLUMNS,
  BOARD_GRID_ROWS,
  BOARD_HEIGHT,
  BOARD_WIDTH
} from "../constants";
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

  it("fills every grid slot with exactly one apple", () => {
    const apples = generateApples("room-seed:2");

    expect(apples).toHaveLength(BOARD_GRID_COLUMNS * BOARD_GRID_ROWS);
  });

  it("aligns apples to the fixed grid slots", () => {
    const apples = generateApples("room-seed:3");
    const cellWidth = (BOARD_WIDTH - APPLE_PADDING * 2) / BOARD_GRID_COLUMNS;
    const cellHeight = (BOARD_HEIGHT - APPLE_PADDING * 2) / BOARD_GRID_ROWS;

    for (const apple of apples) {
      const normalizedColumn = (apple.x - APPLE_PADDING) / cellWidth - 0.5;
      const normalizedRow = (apple.y - APPLE_PADDING) / cellHeight - 0.5;

      expect(normalizedColumn).toBeCloseTo(Math.round(normalizedColumn), 6);
      expect(normalizedRow).toBeCloseTo(Math.round(normalizedRow), 6);
    }
  });
});
