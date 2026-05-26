import {
  APPLE_COUNT,
  APPLE_PADDING,
  BOARD_GRID_COLUMNS,
  BOARD_GRID_ROWS,
  BOARD_HEIGHT,
  BOARD_WIDTH
} from "../constants";
import type { Apple, SelectionRect } from "../types";
import { createSeededRandom } from "./random";

export function getBoardGridMetrics(): {
  innerWidth: number;
  innerHeight: number;
  cellWidth: number;
  cellHeight: number;
} {
  const innerWidth = BOARD_WIDTH - APPLE_PADDING * 2;
  const innerHeight = BOARD_HEIGHT - APPLE_PADDING * 2;
  const cellWidth = innerWidth / BOARD_GRID_COLUMNS;
  const cellHeight = innerHeight / BOARD_GRID_ROWS;

  return {
    innerWidth,
    innerHeight,
    cellWidth,
    cellHeight
  };
}

function createGridSlots(): Array<{ x: number; y: number }> {
  const { cellWidth, cellHeight } = getBoardGridMetrics();
  const slots: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < BOARD_GRID_ROWS; row += 1) {
    for (let column = 0; column < BOARD_GRID_COLUMNS; column += 1) {
      slots.push({
        x: APPLE_PADDING + cellWidth * (column + 0.5),
        y: APPLE_PADDING + cellHeight * (row + 0.5)
      });
    }
  }

  return slots;
}

export function generateApples(seed: string): Apple[] {
  const random = createSeededRandom(seed);
  const slots = createGridSlots();

  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = slots[index];
    slots[index] = slots[swapIndex];
    slots[swapIndex] = current;
  }

  return slots.slice(0, APPLE_COUNT).map((slot, index) => ({
      id: `${seed}-${index}`,
      x: slot.x,
      y: slot.y,
      value: 1 + Math.floor(random() * 9),
      removed: false
    }));
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
    apple.x >= rect.left &&
    apple.x <= rect.left + rect.width &&
    apple.y >= rect.top &&
    apple.y <= rect.top + rect.height
  );
}
