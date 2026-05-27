import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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
  onSubmitRound: (roundIndex: number, score: number, clearTimeMs: number | null) => Promise<void>;
  onForceProgress: () => Promise<void>;
}

interface DragState {
  pointerId: number;
  startBoardX: number;
  startBoardY: number;
  startDisplayX: number;
  startDisplayY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface PointerPosition {
  boardX: number;
  boardY: number;
  displayX: number;
  displayY: number;
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
  const [selectedAppleIds, setSelectedAppleIds] = useState<Set<string>>(() => new Set());
  const [timeLeftMs, setTimeLeftMs] = useState(room.settings.roundDurationSec * 1000);
  const [lightColors, setLightColors] = useState(false);
  const [clearTimeMs, setClearTimeMs] = useState<number | null>(null);
  const progressRequestedRef = useRef(false);
  const dropDirectionRef = useRef<-1 | 1>(1);
  const dropTimeoutsRef = useRef<number[]>([]);

  const remainingApples = useMemo(
    () => apples.filter((apple) => !apple.removed && !apple.dropping).length,
    [apples]
  );

  useEffect(() => {
    return () => {
      for (const timeoutId of dropTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    for (const timeoutId of dropTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }

    dropTimeoutsRef.current = [];
    dropDirectionRef.current = 1;
    setApples(generateApples(roundSeed));
    setScore(room.submissions[roundKey]?.[player.id]?.score ?? 0);
    setClearTimeMs(room.submissions[roundKey]?.[player.id]?.clearTimeMs ?? null);
    setDragState(null);
    setSelectionRect(null);
    setSelectedAppleIds(new Set());
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

    void onSubmitRound(room.currentRoundIndex, score, clearTimeMs);
  }, [clearTimeMs, locked, onSubmitRound, remainingApples, room.currentRoundIndex, score]);

  useEffect(() => {
    if (timeLeftMs > 0 || progressRequestedRef.current) {
      return;
    }

    progressRequestedRef.current = true;

    if (locked) {
      void onForceProgress();
      return;
    }

    void onSubmitRound(room.currentRoundIndex, score, clearTimeMs);
  }, [clearTimeMs, locked, onForceProgress, onSubmitRound, room.currentRoundIndex, score, timeLeftMs]);

  function resetSelection(): void {
    setDragState(null);
    setSelectionRect(null);
    setSelectedAppleIds(new Set());
  }

  function getElapsedRoundMs(): number | null {
    if (room.roundStartedAt === null) {
      return null;
    }

    return Math.max(0, Date.now() - room.roundStartedAt);
  }

  function getPointerPosition(event: ReactPointerEvent<HTMLDivElement>): PointerPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    const displayX = clamp(event.clientX - rect.left, 0, rect.width);
    const displayY = clamp(event.clientY - rect.top, 0, rect.height);
    const scaleX = BOARD_WIDTH / rect.width;
    const scaleY = BOARD_HEIGHT / rect.height;
    const boardX = clamp(displayX * scaleX, 0, BOARD_WIDTH);
    const boardY = clamp(displayY * scaleY, 0, BOARD_HEIGHT);
    return { boardX, boardY, displayX, displayY };
  }

  function getSelectionSnapshot(rect: SelectionRect): { ids: Set<string>; apples: Apple[]; sum: number } {
    const selected = apples.filter(
      (apple) => !apple.removed && !apple.dropping && isAppleInsideRect(apple, rect)
    );

    return {
      ids: new Set(selected.map((apple) => apple.id)),
      apples: selected,
      sum: selected.reduce((total, apple) => total + apple.value, 0)
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (locked || timeLeftMs <= 0) {
      return;
    }

    const { boardX, boardY, displayX, displayY } = getPointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startBoardX: boardX,
      startBoardY: boardY,
      startDisplayX: displayX,
      startDisplayY: displayY
    });
    setSelectionRect(normalizeSelectionRect(displayX, displayY, displayX, displayY));
    setSelectedAppleIds(new Set());
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const { boardX, boardY, displayX, displayY } = getPointerPosition(event);
    const boardRect = normalizeSelectionRect(
      dragState.startBoardX,
      dragState.startBoardY,
      boardX,
      boardY
    );
    const snapshot = getSelectionSnapshot(boardRect);

    setSelectionRect(
      normalizeSelectionRect(dragState.startDisplayX, dragState.startDisplayY, displayX, displayY)
    );
    startTransition(() => {
      setSelectedAppleIds(snapshot.ids);
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const { boardX, boardY } = getPointerPosition(event);
    const rect = normalizeSelectionRect(
      dragState.startBoardX,
      dragState.startBoardY,
      boardX,
      boardY
    );
    const snapshot = getSelectionSnapshot(rect);

    if (snapshot.sum === 10 && snapshot.apples.length > 0 && timeLeftMs > 0 && !locked) {
      const selectedIds = snapshot.ids;
      let nextDirection = dropDirectionRef.current;

      setApples((current) =>
        current.map((apple) => {
          if (!selectedIds.has(apple.id)) {
            return apple;
          }

          nextDirection = nextDirection === 1 ? -1 : 1;

          return {
            ...apple,
            dropping: true,
            dropDirection: nextDirection
          };
        })
      );

      dropDirectionRef.current = nextDirection;
      setScore((current) => current + calculateSelectionScore(snapshot.apples.length));

      if (snapshot.apples.length === remainingApples) {
        setClearTimeMs(getElapsedRoundMs());
      }

      const timeoutId = window.setTimeout(() => {
        setApples((current) =>
          current.map((apple) =>
            selectedIds.has(apple.id)
              ? {
                  ...apple,
                  dropping: false,
                  removed: true
                }
              : apple
          )
        );
        dropTimeoutsRef.current = dropTimeoutsRef.current.filter((value) => value !== timeoutId);
      }, 520);

      dropTimeoutsRef.current.push(timeoutId);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetSelection();
  }

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div>
          <p className={styles.meta}>Room {room.code}</p>
          <p className={styles.player}>Player {player.nickname}</p>
        </div>
        <div className={styles.controls}>
          {clearTimeMs !== null ? (
            <p className={styles.clear}>클리어 {(clearTimeMs / 1000).toFixed(1)}s</p>
          ) : null}
          <label className={styles.toggle}>
            <input
              checked={lightColors}
              type="checkbox"
              onChange={(event) => setLightColors(event.target.checked)}
            />
            Light Colors
          </label>
          <button className={styles.button} type="button" onClick={onLeaveRoom}>
            나가기
          </button>
        </div>
      </div>

      <GameBoard
        apples={apples}
        locked={locked}
        lightColors={lightColors}
        score={score}
        timeLeftMs={timeLeftMs}
        roundDurationSec={room.settings.roundDurationSec}
        selectionRect={selectionRect}
        selectedAppleIds={selectedAppleIds}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      <p className={styles.hint}>사과를 정확히 감싸서 숫자 합이 10이 되면 아래로 떨어집니다.</p>
    </div>
  );
}
