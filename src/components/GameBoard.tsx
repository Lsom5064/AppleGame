import { Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import type { Apple, SelectionRect } from "../types";
import appleImage from "../../apple.png";
import styles from "./GameBoard.module.css";

interface GameBoardProps {
  apples: Apple[];
  locked: boolean;
  lightColors: boolean;
  score: number;
  timeLeftMs: number;
  roundDurationSec: number;
  selectionRect: SelectionRect | null;
  selectedAppleIds: Set<string>;
  teamPointers: Array<{
    playerId: string;
    nickname: string;
    x: number;
    y: number;
    selectionRect: SelectionRect | null;
  }>;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function GameBoard({
  apples,
  locked,
  lightColors,
  score,
  timeLeftMs,
  roundDurationSec,
  selectionRect,
  selectedAppleIds,
  teamPointers,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave
}: GameBoardProps) {
  const timeRatio = clamp(timeLeftMs / (roundDurationSec * 1000), 0, 1);
  const visibleApples = apples.filter((apple) => !apple.removed);
  const shellStyle = {
    "--board-width": BOARD_WIDTH,
    "--board-height": BOARD_HEIGHT
  } as CSSProperties;

  return (
    <div
      className={`${styles.shell} ${lightColors ? styles.lightColors : ""}`}
      style={shellStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.boardFrame}>
        <div className={styles.playfield} />
        <div className={styles.scorePanel}>
          <span className={styles.scoreLabel}>POINT</span>
          <strong className={styles.scoreValue}>{score}</strong>
        </div>
        <div className={styles.timePanel}>
          <span className={styles.timeLabel}>TIME</span>
          <div className={styles.timeRail}>
            <div className={styles.timeFill} style={{ transform: `scaleY(${timeRatio})` }} />
          </div>
          <span className={styles.timeValue}>{Math.max(0, Math.ceil(timeLeftMs / 1000))}</span>
        </div>

        {visibleApples.map((apple) => {
          const isSelected = selectedAppleIds.has(apple.id);
          const style = {
            left: apple.x,
            top: apple.y,
            width: apple.width,
            height: apple.height,
            "--drop-x": `${apple.dropDirection * 38}px`,
            "--drop-rotate": `${apple.dropDirection * 18}deg`
          } as CSSProperties;

          return (
            <div
              key={apple.id}
              className={[
                styles.apple,
                isSelected ? styles.selected : "",
                apple.dropping ? styles.dropping : ""
              ].join(" ")}
              style={style}
            >
              <span className={styles.appleShadow} />
              <span className={styles.appleBody}>
                <img alt="" className={styles.appleImage} draggable={false} src={appleImage} />
                <span className={styles.appleValue}>{apple.value}</span>
              </span>
            </div>
          );
        })}

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

        {teamPointers.map((pointer, index) => {
          const hue = (index * 79 + 18) % 360;

          return (
            <Fragment key={pointer.playerId}>
              {pointer.selectionRect ? (
                <div
                  className={`${styles.selection} ${styles.teammateSelection}`}
                  style={
                    {
                      left: pointer.selectionRect.left,
                      top: pointer.selectionRect.top,
                      width: pointer.selectionRect.width,
                      height: pointer.selectionRect.height,
                      "--pointer-hue": hue
                    } as CSSProperties
                  }
                />
              ) : null}
              <div
                className={styles.pointer}
                style={
                  {
                    left: pointer.x,
                    top: pointer.y,
                    "--pointer-hue": hue
                  } as CSSProperties
                }
              >
                <span className={styles.pointerDot} />
                <span className={styles.pointerLabel}>{pointer.nickname}</span>
              </div>
            </Fragment>
          );
        })}

      </div>

      {locked ? <div className={styles.locked}>다른 참가자를 기다리는 중</div> : null}
    </div>
  );
}
