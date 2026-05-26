import {
  APPLE_COUNT,
  APPLE_PADDING,
  APPLE_RADIUS,
  BOARD_HEIGHT,
  BOARD_WIDTH
} from "../constants";
import type { Apple, SelectionRect } from "../types";
import { createSeededRandom } from "./random";

export function generateApples(seed: string): Apple[] {
  const random = createSeededRandom(seed);
  const apples: Apple[] = [];
  const minDistance = APPLE_RADIUS * 2.1;

  for (let index = 0; index < APPLE_COUNT; index += 1) {
    const value = 1 + Math.floor(random() * 9);
    let x = APPLE_PADDING + random() * (BOARD_WIDTH - APPLE_PADDING * 2);
    let y = APPLE_PADDING + random() * (BOARD_HEIGHT - APPLE_PADDING * 2);

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const collides = apples.some((apple) => {
        const dx = apple.x - x;
        const dy = apple.y - y;
        return Math.hypot(dx, dy) < minDistance;
      });

      if (!collides) {
        break;
      }

      x = APPLE_PADDING + random() * (BOARD_WIDTH - APPLE_PADDING * 2);
      y = APPLE_PADDING + random() * (BOARD_HEIGHT - APPLE_PADDING * 2);
    }

    apples.push({
      id: `${seed}-${index}`,
      x,
      y,
      value,
      removed: false
    });
  }

  return apples;
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
