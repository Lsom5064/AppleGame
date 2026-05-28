import { describe, expect, it } from "vitest";
import {
  APPLE_COUNT,
  APPLE_HEIGHT,
  APPLE_SPACING_X,
  APPLE_SPACING_Y,
  APPLE_START_X,
  APPLE_START_Y,
  APPLE_WIDTH,
  BOARD_GRID_COLUMNS,
  BOARD_GRID_ROWS
} from "../constants";
import { generateApples, getBoardSlots, isAppleInsideRect, normalizeSelectionRect } from "../utils/gameBoard";

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

  it("keeps apples on the original fixed lattice with valid values", () => {
    const apples = generateApples("room-seed:2");

    expect(apples).toHaveLength(APPLE_COUNT);

    for (const apple of apples) {
      expect(apple.value).toBeGreaterThanOrEqual(1);
      expect(apple.value).toBeLessThanOrEqual(9);
      expect(apple.width).toBe(APPLE_WIDTH);
      expect(apple.height).toBe(APPLE_HEIGHT);
      expect((apple.x - APPLE_START_X) % APPLE_SPACING_X).toBe(0);
      expect((apple.y - APPLE_START_Y) % APPLE_SPACING_Y).toBe(0);
      expect(apple.dropping).toBe(false);
      expect(apple.removed).toBe(false);
    }
  });

  it("fills every fixed board slot with exactly one apple", () => {
    const apples = generateApples("room-seed:3");
    const slots = new Set(getBoardSlots().map((slot) => `${slot.column}:${slot.row}:${slot.x}:${slot.y}`));

    expect(apples).toHaveLength(BOARD_GRID_COLUMNS * BOARD_GRID_ROWS);

    for (const apple of apples) {
      expect(slots.has(`${apple.column}:${apple.row}:${apple.x}:${apple.y}`)).toBe(true);
    }
  });

  it("matches the original slot count and spacing", () => {
    const slots = getBoardSlots();

    expect(slots).toHaveLength(BOARD_GRID_COLUMNS * BOARD_GRID_ROWS);
    expect(slots[0]).toMatchObject({ column: 0, row: 0, x: APPLE_START_X, y: APPLE_START_Y });
    expect(slots[BOARD_GRID_COLUMNS - 1]).toMatchObject({
      column: BOARD_GRID_COLUMNS - 1,
      row: 0,
      x: APPLE_START_X + (BOARD_GRID_COLUMNS - 1) * APPLE_SPACING_X,
      y: APPLE_START_Y
    });
  });

  it("keeps vertical row spacing at or above the apple height to avoid row overlap", () => {
    expect(APPLE_SPACING_Y).toBeGreaterThanOrEqual(APPLE_HEIGHT);
  });

  it("keeps the total board sum aligned to 10 without creating a single 10 apple", () => {
    const apples = generateApples("room-seed:4");
    const total = apples.reduce((sum, apple) => sum + apple.value, 0);

    expect(total % 10).toBe(0);
    expect(apples.some((apple) => apple.value === 10)).toBe(false);
  });

  it("selects an apple when the drag rect contains its center point", () => {
    const [apple] = generateApples("room-seed:5");
    const rect = normalizeSelectionRect(
      apple.x - 4,
      apple.y - 4,
      apple.x + 4,
      apple.y + 4
    );

    expect(isAppleInsideRect(apple, rect)).toBe(true);
  });

  it("does not select an apple when the drag rect overlaps its edge but misses the center point", () => {
    const [apple] = generateApples("room-seed:6");
    const rect = normalizeSelectionRect(
      apple.x - apple.width / 2 - 2,
      apple.y - apple.height / 2 - 2,
      apple.x - apple.width / 2 + 8,
      apple.y + 8
    );

    expect(isAppleInsideRect(apple, rect)).toBe(false);
  });
});
