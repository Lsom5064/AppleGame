import { Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PLAYFIELD_INSET_BOTTOM,
  PLAYFIELD_INSET_LEFT,
  PLAYFIELD_INSET_RIGHT,
  PLAYFIELD_INSET_TOP
} from "../constants";
import type { Apple, SelectionRect } from "../types";
import appleImage from "../../apple.png";
import greenAppleImage from "../../green_apple.png";
import styles from "./GameBoard.module.css";

interface GameBoardProps {
  apples: Apple[];
  officeTheme: boolean;
  locked: boolean;
  lightColors: boolean;
  score: number;
  countdownMs: number;
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
  officeTheme,
  locked,
  lightColors,
  score,
  countdownMs,
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
  const isCountingDown = countdownMs > 0;
  const countdownValue = Math.max(1, Math.ceil(countdownMs / 1000));
  const visibleApples = isCountingDown ? [] : apples.filter((apple) => !apple.removed);
  const currentAppleImage = officeTheme ? greenAppleImage : appleImage;
  const shellStyle = {
    "--board-width": BOARD_WIDTH,
    "--board-height": BOARD_HEIGHT,
    "--playfield-inset-left": `${PLAYFIELD_INSET_LEFT}px`,
    "--playfield-inset-top": `${PLAYFIELD_INSET_TOP}px`,
    "--playfield-inset-right": `${PLAYFIELD_INSET_RIGHT}px`,
    "--playfield-inset-bottom": `${PLAYFIELD_INSET_BOTTOM}px`
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
                <img alt="" className={styles.appleImage} draggable={false} src={currentAppleImage} />
                <span className={styles.appleValue}>{apple.value}</span>
              </span>
            </div>
          );
        })}

        {selectionRect && !isCountingDown ? (
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

        {!isCountingDown
          ? teamPointers.map((pointer, index) => {
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
            })
          : null}

        {isCountingDown ? (
          <div className={styles.countdownOverlay}>
            <span className={styles.countdownLabel}>READY</span>
            <strong className={styles.countdownValue}>{countdownValue}</strong>
          </div>
        ) : null}

      </div>

      {locked ? <div className={styles.locked}>다른 참가자를 기다리는 중</div> : null}
    </div>
  );
}
