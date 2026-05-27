import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import type { Apple, PlayerState, RoomState, SelectionRect } from "../types";
import { generateApples, isAppleInsideRect, normalizeSelectionRect } from "../utils/gameBoard";
import { calculateSelectionScore } from "../utils/scoring";
import { GameBoard } from "./GameBoard";
import { RoomChat } from "./RoomChat";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onVoteNextRound: () => Promise<void>;
  onSendChatMessage: (text: string) => Promise<void>;
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

interface LiveScoreEntry {
  id: string;
  nickname: string;
  isHost: boolean;
  roundScores: Array<number | null>;
  totalScore: number;
}

export function GameScreen({
  room,
  player,
  onLeaveRoom,
  onVoteNextRound,
  onSendChatMessage,
  onSubmitRound,
  onForceProgress
}: GameScreenProps) {
  const roundSeed = `${room.seed}:${room.currentRoundIndex}`;
  const roundKey = String(room.currentRoundIndex);
  const waitingForNextRound = room.phase === "between-rounds";
  const locked = waitingForNextRound ? false : Boolean(room.submissions[roundKey]?.[player.id]);
  const activeRoundNumber = waitingForNextRound ? room.currentRoundIndex + 2 : room.currentRoundIndex + 1;
  const lastRoundSubmission = waitingForNextRound ? room.submissions[roundKey]?.[player.id] ?? null : null;
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
  const voteCount = Object.keys(room.nextRoundVotes).length;
  const playerIds = Object.keys(room.players);
  const hasVotedForNextRound = Boolean(room.nextRoundVotes[player.id]);
  const voters = playerIds
    .filter((id) => room.nextRoundVotes[id])
    .map((id) => room.players[id]?.nickname ?? id);
  const liveScoreboard = useMemo<LiveScoreEntry[]>(() => {
    const roundCount = room.settings.roundCount;
    const currentRoundIndex = room.currentRoundIndex;

    return Object.values(room.players)
      .map((member) => {
        const roundScores = Array.from({ length: roundCount }, (_, roundIndex) => {
          const savedScore = member.roundScores[String(roundIndex)];

          if (savedScore !== undefined) {
            return savedScore;
          }

          if (roundIndex < currentRoundIndex) {
            return 0;
          }

          if (roundIndex > currentRoundIndex) {
            return null;
          }

          if (waitingForNextRound) {
            return room.submissions[String(currentRoundIndex)]?.[member.id]?.score ?? 0;
          }

          if (member.id === player.id) {
            return score;
          }

          return room.submissions[String(currentRoundIndex)]?.[member.id]?.score ?? null;
        });

        const totalScore = roundScores.reduce<number>((sum, roundScore) => sum + (roundScore ?? 0), 0);

        return {
          id: member.id,
          nickname: member.nickname,
          isHost: member.isHost,
          roundScores,
          totalScore
        };
      })
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore;
        }

        const leftPlayer = room.players[left.id];
        const rightPlayer = room.players[right.id];
        return leftPlayer.joinedAt - rightPlayer.joinedAt;
      });
  }, [player.id, room.currentRoundIndex, room.players, room.settings.roundCount, room.submissions, score, waitingForNextRound]);

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
  }, [player.id, room.phase, room.roundStartedAt, room.settings.roundDurationSec, roundKey, roundSeed]);

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
    if (waitingForNextRound || remainingApples > 0 || locked) {
      return;
    }

    void onSubmitRound(room.currentRoundIndex, score, clearTimeMs);
  }, [clearTimeMs, locked, onSubmitRound, remainingApples, room.currentRoundIndex, score, waitingForNextRound]);

  useEffect(() => {
    if (waitingForNextRound || timeLeftMs > 0 || progressRequestedRef.current) {
      return;
    }

    progressRequestedRef.current = true;

    if (locked) {
      void onForceProgress();
      return;
    }

    void onSubmitRound(room.currentRoundIndex, score, clearTimeMs);
  }, [
    clearTimeMs,
    locked,
    onForceProgress,
    onSubmitRound,
    room.currentRoundIndex,
    score,
    timeLeftMs,
    waitingForNextRound
  ]);

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
    if (locked || waitingForNextRound || timeLeftMs <= 0) {
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
          <p className={styles.round}>
            Round {activeRoundNumber} / {room.settings.roundCount}
          </p>
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

      {waitingForNextRound ? (
        <div className={styles.waitingLayout}>
          <div className={styles.waitingCard}>
            <p className={styles.waitingTitle}>{room.currentRoundIndex + 1}라운드가 끝났습니다.</p>
            {lastRoundSubmission ? (
              <p className={styles.waitingSummary}>
                이번 라운드 점수 {lastRoundSubmission.score}점 / 클리어{" "}
                {lastRoundSubmission.clearTimeMs === null
                  ? "-"
                  : `${(lastRoundSubmission.clearTimeMs / 1000).toFixed(1)}s`}
              </p>
            ) : null}
            <p className={styles.waitingSummary}>
              다음 라운드 찬성 {voteCount} / {playerIds.length}
            </p>
            <p className={styles.voteList}>
              {voters.length > 0 ? `찬성 완료: ${voters.join(", ")}` : "아직 찬성한 사람이 없습니다."}
            </p>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={hasVotedForNextRound}
              onClick={() => void onVoteNextRound()}
            >
              {hasVotedForNextRound ? "찬성 완료" : `${room.currentRoundIndex + 2}라운드 찬성하기`}
            </button>
            <p className={styles.waitingSummary}>모든 인원이 찬성하면 자동으로 다음 라운드가 시작됩니다.</p>
          </div>

          <RoomChat
            player={player}
            messages={room.chatMessages}
            title="라운드 대기 채팅"
            onSendMessage={onSendChatMessage}
          />
        </div>
      ) : (
        <>
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

          <section className={styles.scoreboardPanel}>
            <h2 className={styles.scoreboardTitle}>현재 점수판</h2>
            <div className={styles.scoreboardWrap}>
              <table className={styles.scoreboardTable}>
                <thead>
                  <tr>
                    <th>플레이어</th>
                    {Array.from({ length: room.settings.roundCount }, (_, roundIndex) => (
                      <th key={roundIndex}>R{roundIndex + 1}</th>
                    ))}
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {liveScoreboard.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {entry.nickname}
                        {entry.isHost ? " (방장)" : ""}
                      </td>
                      {entry.roundScores.map((roundScore, roundIndex) => (
                        <td key={roundIndex}>{roundScore === null ? "-" : roundScore}</td>
                      ))}
                      <td>{entry.totalScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className={styles.hint}>사과를 정확히 감싸서 숫자 합이 10이 되면 아래로 떨어집니다.</p>
        </>
      )}

      {waitingForNextRound ? (
        <section className={styles.scoreboardPanel}>
          <h2 className={styles.scoreboardTitle}>전체 점수판</h2>
          <div className={styles.scoreboardWrap}>
            <table className={styles.scoreboardTable}>
              <thead>
                <tr>
                  <th>플레이어</th>
                  {Array.from({ length: room.settings.roundCount }, (_, roundIndex) => (
                    <th key={roundIndex}>R{roundIndex + 1}</th>
                  ))}
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {liveScoreboard.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.nickname}
                      {entry.isHost ? " (방장)" : ""}
                    </td>
                    {entry.roundScores.map((roundScore, roundIndex) => (
                      <td key={roundIndex}>{roundScore === null ? "-" : roundScore}</td>
                    ))}
                    <td>{entry.totalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
