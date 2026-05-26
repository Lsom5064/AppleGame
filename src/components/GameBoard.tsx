import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { APPLE_PADDING } from "../constants";
import type { Apple, SelectionRect } from "../types";
import { getBoardGridMetrics } from "../utils/gameBoard";
import styles from "./GameBoard.module.css";

interface GameBoardProps {
  apples: Apple[];
  locked: boolean;
  lightColors: boolean;
  selectionRect: SelectionRect | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function GameBoard({
  apples,
  locked,
  lightColors,
  selectionRect,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: GameBoardProps) {
  const { columnWidths, rowHeights, slots } = getBoardGridMetrics();
  const smallestColumn = Math.min(...columnWidths);
  const smallestRow = Math.min(...rowHeights);
  const gridStyle = {
    "--grid-inset": `${APPLE_PADDING}px`,
    "--grid-columns": columnWidths.map((width) => `${width}px`).join(" "),
    "--grid-rows": rowHeights.map((height) => `${height}px`).join(" "),
    "--apple-font-size": `${Math.max(13, Math.min(smallestColumn, smallestRow) * 0.52)}px`
  } as CSSProperties;

  return (
    <div
      className={`${styles.shell} ${lightColors ? styles.lightColors : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.grid} style={gridStyle}>
        {slots.map((slot) => (
          <div
            key={`${slot.column}-${slot.row}`}
            className={styles.gridCell}
          />
        ))}
      </div>

      {apples.map((apple) => (
        <div
          key={apple.id}
          className={`${styles.apple} ${apple.removed ? styles.removed : ""}`}
          style={{
            left: apple.x,
            top: apple.y,
            width: apple.width,
            height: apple.height
          }}
        >
          <span className={styles.appleValue}>{apple.value}</span>
        </div>
      ))}

      {selectionRect ? (
        <div
          className={styles.selection}
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height
          }}
        />
      ) : null}

      {locked ? <div className={styles.locked}>다른 참가자를 기다리는 중</div> : null}
    </div>
  );
}
