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
import type { Apple, SelectionRect } from "../types";
import { createSeededRandom } from "./random";

interface BoardSlot {
  column: number;
  row: number;
  x: number;
  y: number;
}

export function getBoardSlots(): BoardSlot[] {
  const slots: BoardSlot[] = [];

  for (let row = 0; row < BOARD_GRID_ROWS; row += 1) {
    for (let column = 0; column < BOARD_GRID_COLUMNS; column += 1) {
      slots.push({
        column,
        row,
        x: APPLE_START_X + column * APPLE_SPACING_X,
        y: APPLE_START_Y + row * APPLE_SPACING_Y
      });
    }
  }

  return slots;
}

export function generateApples(seed: string): Apple[] {
  const random = createSeededRandom(seed);
  const slots = getBoardSlots();

  while (true) {
    let sum = 0;
    let hasSingleTen = false;
    const values: number[] = [];

    for (let index = 0; index < APPLE_COUNT; index += 1) {
      if (index === APPLE_COUNT - 1) {
        const adjustedValue = 10 - (sum % 10);
        values.push(adjustedValue);
        hasSingleTen = adjustedValue === 10;
        continue;
      }

      const value = 1 + Math.floor(random() * 9);
      values.push(value);
      sum += value;
    }

    if (hasSingleTen) {
      continue;
    }

    return slots.map((slot, index) => ({
      id: `${seed}-${slot.column}-${slot.row}`,
      column: slot.column,
      row: slot.row,
      width: APPLE_WIDTH,
      height: APPLE_HEIGHT,
      x: slot.x,
      y: slot.y,
      value: values[index],
      dropping: false,
      dropDirection: 1,
      removed: false
    }));
  }
}

export function normalizeSelectionRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): SelectionRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(startX - endX),
    height: Math.abs(startY - endY)
  };
}

export function isAppleInsideRect(apple: Apple, rect: SelectionRect): boolean {
  return (
    apple.x > rect.left &&
    apple.x < rect.left + rect.width &&
    apple.y > rect.top &&
    apple.y < rect.top + rect.height
  );
}
