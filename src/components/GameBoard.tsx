import type { PointerEvent as ReactPointerEvent } from "react";
import type { Apple, SelectionRect } from "../types";
import styles from "./GameBoard.module.css";

interface GameBoardProps {
  apples: Apple[];
  locked: boolean;
  selectionRect: SelectionRect | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function GameBoard({
  apples,
  locked,
  selectionRect,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: GameBoardProps) {
  return (
    <div
      className={styles.shell}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.grid} />

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
