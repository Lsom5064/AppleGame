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

interface GridAxisMetrics {
  sizes: number[];
  starts: number[];
}

interface GridSlot {
  column: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export function getBoardGridMetrics(): {
  innerWidth: number;
  innerHeight: number;
  columnWidths: number[];
  rowHeights: number[];
  columnStarts: number[];
  rowStarts: number[];
  slots: GridSlot[];
} {
  const innerWidth = BOARD_WIDTH - APPLE_PADDING * 2;
  const innerHeight = BOARD_HEIGHT - APPLE_PADDING * 2;
  const columns = distributeAxis(innerWidth, BOARD_GRID_COLUMNS, APPLE_PADDING);
  const rows = distributeAxis(innerHeight, BOARD_GRID_ROWS, APPLE_PADDING);
  const slots = createGridSlots(columns, rows);

  return {
    innerWidth,
    innerHeight,
    columnWidths: columns.sizes,
    rowHeights: rows.sizes,
    columnStarts: columns.starts,
    rowStarts: rows.starts,
    slots
  };
}

function distributeAxis(total: number, segments: number, start: number): GridAxisMetrics {
  const baseSize = Math.floor(total / segments);
  const remainder = total % segments;
  const sizes = Array.from({ length: segments }, (_, index) => baseSize + (index < remainder ? 1 : 0));
  const starts: number[] = [];
  let cursor = start;

  for (const size of sizes) {
    starts.push(cursor);
    cursor += size;
  }

  return { sizes, starts };
}

function createGridSlots(columns: GridAxisMetrics, rows: GridAxisMetrics): GridSlot[] {
  const slots: GridSlot[] = [];

  for (let row = 0; row < BOARD_GRID_ROWS; row += 1) {
    for (let column = 0; column < BOARD_GRID_COLUMNS; column += 1) {
      const left = columns.starts[column];
      const top = rows.starts[row];
      const width = columns.sizes[column];
      const height = rows.sizes[row];
      slots.push({
        column,
        row,
        left,
        top,
        width,
        height,
        centerX: left + width / 2,
        centerY: top + height / 2
      });
    }
  }

  return slots;
}

export function generateApples(seed: string): Apple[] {
  const random = createSeededRandom(seed);
  const { slots } = getBoardGridMetrics();

  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = slots[index];
    slots[index] = slots[swapIndex];
    slots[swapIndex] = current;
  }

  return slots.slice(0, APPLE_COUNT).map((slot, index) => ({
      id: `${seed}-${index}`,
      column: slot.column,
      row: slot.row,
      width: slot.width,
      height: slot.height,
      x: slot.centerX,
      y: slot.centerY,
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
