import { describe, expect, it } from "vitest";
import {
  APPLE_COUNT,
  APPLE_PADDING,
  BOARD_GRID_COLUMNS,
  BOARD_GRID_ROWS,
  BOARD_HEIGHT,
  BOARD_WIDTH
} from "../constants";
import { generateApples, getBoardGridMetrics } from "../utils/gameBoard";

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

  it("distributes the grid to match the full board interior exactly", () => {
    const metrics = getBoardGridMetrics();

    expect(metrics.columnWidths).toHaveLength(BOARD_GRID_COLUMNS);
    expect(metrics.rowHeights).toHaveLength(BOARD_GRID_ROWS);
    expect(metrics.columnWidths.reduce((sum, width) => sum + width, 0)).toBe(
      BOARD_WIDTH - APPLE_PADDING * 2
    );
    expect(metrics.rowHeights.reduce((sum, height) => sum + height, 0)).toBe(
      BOARD_HEIGHT - APPLE_PADDING * 2
    );
  });

  it("aligns apples to the fixed grid slots", () => {
    const apples = generateApples("room-seed:3");
    const metrics = getBoardGridMetrics();
    const slotCenters = new Set(
      metrics.slots.map((slot) => `${slot.centerX}:${slot.centerY}:${slot.width}:${slot.height}`)
    );

    for (const apple of apples) {
      expect(slotCenters.has(`${apple.x}:${apple.y}:${apple.width}:${apple.height}`)).toBe(true);
    }
  });
});
