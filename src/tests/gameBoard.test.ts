import { describe, expect, it } from "vitest";
import {
  APPLE_COUNT,
  APPLE_PADDING,
  BOARD_GRID_COLUMNS,
  BOARD_GRID_ROWS,
  BOARD_HEIGHT,
  BOARD_WIDTH
} from "../constants";
import { generateApples, getSelectionStats } from "../utils/gameBoard";

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

  it("calculates the current drag selection sum and ids", () => {
    const apples = [
      { id: "a", x: 100, y: 100, value: 4, removed: false },
      { id: "b", x: 140, y: 100, value: 6, removed: false },
      { id: "c", x: 240, y: 160, value: 3, removed: false },
      { id: "d", x: 120, y: 120, value: 5, removed: true }
    ];
    const selection = {
      left: 90,
      top: 90,
      width: 70,
      height: 30
    };

    const stats = getSelectionStats(apples, selection);

    expect(stats.selectedSum).toBe(10);
    expect(stats.selectedCount).toBe(2);
    expect(Array.from(stats.selectedAppleIds).sort()).toEqual(["a", "b"]);
  });
});
