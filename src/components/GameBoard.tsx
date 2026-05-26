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
  const { cellWidth, cellHeight } = getBoardGridMetrics();
  const gridStyle = {
    "--grid-inset": `${APPLE_PADDING}px`,
    "--grid-cell-width": `${cellWidth}px`,
    "--grid-cell-height": `${cellHeight}px`
  } as CSSProperties;

  return (
    <div
      className={`${styles.shell} ${lightColors ? styles.lightColors : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.grid} style={gridStyle} />

      {apples.map((apple) => (
        <div
          key={apple.id}
          className={`${styles.apple} ${apple.removed ? styles.removed : ""}`}
          style={{ left: apple.x, top: apple.y }}
        >
          {apple.value}
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
