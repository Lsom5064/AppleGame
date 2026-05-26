import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import type { Apple, PlayerState, RoomState, SelectionRect } from "../types";
import { generateApples, isAppleInsideRect, normalizeSelectionRect } from "../utils/gameBoard";
import { calculateSelectionScore } from "../utils/scoring";
import { GameBoard } from "./GameBoard";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onSubmitRound: (roundIndex: number, score: number) => Promise<void>;
  onForceProgress: () => Promise<void>;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function GameScreen({
  room,
  player,
  onLeaveRoom,
  onSubmitRound,
  onForceProgress
}: GameScreenProps) {
  const roundSeed = `${room.seed}:${room.currentRoundIndex}`;
  const roundKey = String(room.currentRoundIndex);
  const locked = Boolean(room.submissions[roundKey]?.[player.id]);
  const [apples, setApples] = useState<Apple[]>(() => generateApples(roundSeed));
  const [score, setScore] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(room.settings.roundDurationSec * 1000);
  const progressRequestedRef = useRef(false);

  const remainingApples = useMemo(
    () => apples.filter((apple) => !apple.removed).length,
    [apples]
  );

  useEffect(() => {
    setApples(generateApples(roundSeed));
    setScore(room.submissions[roundKey]?.[player.id]?.score ?? 0);
    setDragState(null);
    setSelectionRect(null);
    setTimeLeftMs(room.settings.roundDurationSec * 1000);
    progressRequestedRef.current = false;
  }, [player.id, room.settings.roundDurationSec, roundKey, roundSeed]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (room.roundStartedAt === null) {
        return;
      }

      const deadline = room.roundStartedAt + room.settings.roundDurationSec * 1000;
      setTimeLeftMs(Math.max(0, deadline - Date.now()));
    }, 200);

    return () => window.clearInterval(interval);
  }, [room.roundStartedAt, room.settings.roundDurationSec]);

  useEffect(() => {
    if (remainingApples > 0 || locked) {
      return;
    }

    void onSubmitRound(room.currentRoundIndex, score);
  }, [locked, onSubmitRound, remainingApples, room.currentRoundIndex, score]);

  useEffect(() => {
    if (timeLeftMs > 0 || progressRequestedRef.current) {
      return;
    }

    progressRequestedRef.current = true;

    if (locked) {
      void onForceProgress();
      return;
    }

    void onSubmitRound(room.currentRoundIndex, score);
  }, [locked, onForceProgress, onSubmitRound, room.currentRoundIndex, score, timeLeftMs]);

  function getBoardPoint(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = BOARD_WIDTH / rect.width;
    const scaleY = BOARD_HEIGHT / rect.height;
    const x = clamp((event.clientX - rect.left) * scaleX, 0, BOARD_WIDTH);
    const y = clamp((event.clientY - rect.top) * scaleY, 0, BOARD_HEIGHT);
    return { x, y };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (locked) {
      return;
    }

    const { x, y } = getBoardPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ pointerId: event.pointerId, startX: x, startY: y });
    setSelectionRect(normalizeSelectionRect(x, y, x, y));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const { x, y } = getBoardPoint(event);
    setSelectionRect(normalizeSelectionRect(dragState.startX, dragState.startY, x, y));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const { x, y } = getBoardPoint(event);
    const rect = normalizeSelectionRect(dragState.startX, dragState.startY, x, y);
    const selected = apples.filter((apple) => !apple.removed && isAppleInsideRect(apple, rect));
    const sum = selected.reduce((total, apple) => total + apple.value, 0);

    if (sum === 10 && selected.length > 0) {
      const selectedIds = new Set(selected.map((apple) => apple.id));
      setApples((current) =>
        current.map((apple) =>
          selectedIds.has(apple.id)
            ? {
                ...apple,
                removed: true
              }
            : apple
        )
      );
      setScore((current) => current + calculateSelectionScore(selected.length));
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
    setSelectionRect(null);
  }

  const displayedSeconds = Math.ceil(timeLeftMs / 1000);

  return (
    <div className={styles.layout}>
      <div className={styles.topBar}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Room</span>
          <p className={styles.metricValue}>{room.code}</p>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Round</span>
          <p className={styles.metricValue}>
            {room.currentRoundIndex + 1} / {room.settings.roundCount}
          </p>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Time</span>
          <p className={styles.metricValue}>{displayedSeconds}s</p>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Score</span>
          <p className={styles.metricValue}>{score}</p>
        </div>
      </div>

      <section className={styles.panel}>
        <GameBoard
          apples={apples}
          locked={locked}
          selectionRect={selectionRect}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </section>

      <div className={styles.footer}>
        <p className={styles.hint}>
          드래그한 범위 안의 사과 숫자 합이 정확히 10이면 제거됩니다. 현재 남은 사과: {remainingApples}
        </p>
        <button className={styles.button} type="button" onClick={onLeaveRoom}>
          나가기
        </button>
      </div>
    </div>
  );
}
