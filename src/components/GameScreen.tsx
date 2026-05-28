import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, POINTER_STALE_MS } from "../constants";
import type { Apple, PlayerState, RoomState, SelectionRect } from "../types";
import { generateApples, isAppleInsideRect, normalizeSelectionRect } from "../utils/gameBoard";
import { getConnectedPlayerIds, isPlayerConnected } from "../utils/presence";
import { calculateSelectionScore } from "../utils/scoring";
import { getTeamName } from "../utils/teams";
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
  onSubmitSharedSelection: (
    roundIndex: number,
    appleIds: string[],
    clearTimeMs: number | null
  ) => Promise<void>;
  onUpdateTeamPointer: (
    roundIndex: number,
    x: number,
    y: number,
    active: boolean,
    dragging: boolean,
    selectionStartX: number,
    selectionStartY: number
  ) => Promise<void>;
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
  connected: boolean;
  teamName: string | null;
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
  onSubmitSharedSelection,
  onUpdateTeamPointer,
  onForceProgress
}: GameScreenProps) {
  const roundSeed = `${room.seed}:${room.currentRoundIndex}`;
  const roundKey = String(room.currentRoundIndex);
  const sharedTeamMode = room.settings.gameMode === "team" && room.settings.teamMode === "shared";
  const playerTeamId = player.teamId;
  const sharedTeamBoard =
    sharedTeamMode && playerTeamId ? room.sharedTeamBoards[roundKey]?.[playerTeamId] ?? null : null;
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
  const [pointerNow, setPointerNow] = useState(() => Date.now());
  const progressRequestedRef = useRef(false);
  const dropDirectionRef = useRef<-1 | 1>(1);
  const dropTimeoutsRef = useRef<number[]>([]);
  const pointerSyncRef = useRef<{
    sentAt: number;
    x: number;
    y: number;
    active: boolean;
    dragging: boolean;
    selectionStartX: number;
    selectionStartY: number;
  } | null>(null);

  const remainingApples = useMemo(
    () => apples.filter((apple) => !apple.removed && !apple.dropping).length,
    [apples]
  );
  const displayedScore = sharedTeamMode ? sharedTeamBoard?.score ?? 0 : score;
  const connectedPlayerIds = getConnectedPlayerIds(room);
  const consensusPlayerIds = connectedPlayerIds.length > 0 ? connectedPlayerIds : Object.keys(room.players);
  const voteCount = consensusPlayerIds.filter((id) => room.nextRoundVotes[id]).length;
  const playerIds = Object.keys(room.players);
  const hasVotedForNextRound = Boolean(room.nextRoundVotes[player.id]);
  const voters = playerIds
    .filter((id) => room.nextRoundVotes[id])
    .map((id) => room.players[id]?.nickname ?? id);
  const teamPointers = useMemo(
    () =>
      sharedTeamMode && playerTeamId
        ? Object.values(room.teamPointers)
            .filter(
              (pointer) =>
                pointer.playerId !== player.id &&
                pointer.teamId === playerTeamId &&
                pointer.roundIndex === room.currentRoundIndex &&
                pointer.active &&
                pointerNow - pointer.updatedAt <= POINTER_STALE_MS &&
                isPlayerConnected(room.players[pointer.playerId], pointerNow)
            )
            .map((pointer) => ({
              playerId: pointer.playerId,
              nickname: room.players[pointer.playerId]?.nickname ?? pointer.playerId,
              x: pointer.x,
              y: pointer.y,
              selectionRect: pointer.dragging
                ? normalizeSelectionRect(
                    pointer.selectionStartX,
                    pointer.selectionStartY,
                    pointer.x,
                    pointer.y
                  )
                : null
            }))
        : [],
    [player.id, playerTeamId, pointerNow, room.currentRoundIndex, room.players, room.teamPointers, sharedTeamMode]
  );
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

          if (sharedTeamMode && member.teamId) {
            return room.sharedTeamBoards[String(currentRoundIndex)]?.[member.teamId]?.score ?? 0;
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
          connected: isPlayerConnected(member),
          teamName: room.settings.gameMode === "team" ? getTeamName(room.teams, member.teamId) : null,
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
  }, [
    player.id,
    room.currentRoundIndex,
    room.players,
    room.settings.gameMode,
    room.settings.roundCount,
    room.sharedTeamBoards,
    room.submissions,
    room.teams,
    score,
    sharedTeamMode,
    waitingForNextRound
  ]);

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
    const nextApples = generateApples(roundSeed).map((apple) =>
      sharedTeamMode && sharedTeamBoard?.removedAppleIds.includes(apple.id)
        ? {
            ...apple,
            removed: true
          }
        : apple
    );
    setApples(nextApples);
    setScore(room.submissions[roundKey]?.[player.id]?.score ?? 0);
    setClearTimeMs(sharedTeamMode ? sharedTeamBoard?.clearTimeMs ?? null : room.submissions[roundKey]?.[player.id]?.clearTimeMs ?? null);
    setDragState(null);
    setSelectionRect(null);
    setSelectedAppleIds(new Set());
    setTimeLeftMs(room.settings.roundDurationSec * 1000);
    progressRequestedRef.current = false;
    pointerSyncRef.current = null;
  }, [
    player.id,
    room.phase,
    room.roundStartedAt,
    room.settings.roundDurationSec,
    roundKey,
    roundSeed,
    sharedTeamMode
  ]);

  useEffect(() => {
    if (!sharedTeamMode || !sharedTeamBoard) {
      return;
    }

    setClearTimeMs(sharedTeamBoard.clearTimeMs);

    const removedSet = new Set(sharedTeamBoard.removedAppleIds);
    const currentVisibleIds = new Set(
      apples.filter((apple) => apple.removed || apple.dropping).map((apple) => apple.id)
    );
    const newRemovedIds = sharedTeamBoard.removedAppleIds.filter((appleId) => !currentVisibleIds.has(appleId));

    if (newRemovedIds.length === 0) {
      return;
    }

    let nextDirection = dropDirectionRef.current;
    const selectedIds = new Set(newRemovedIds);

    setApples((current) =>
      current.map((apple) => {
        if (!selectedIds.has(apple.id) || apple.removed || apple.dropping) {
          return removedSet.has(apple.id) && !apple.dropping
            ? {
                ...apple,
                removed: true
              }
            : apple;
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

    const timeoutId = window.setTimeout(() => {
      setApples((current) =>
        current.map((apple) =>
          removedSet.has(apple.id)
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
  }, [apples, sharedTeamBoard, sharedTeamMode]);

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
    if (!sharedTeamMode) {
      return;
    }

    const interval = window.setInterval(() => {
      setPointerNow(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [sharedTeamMode]);

  useEffect(() => {
    if (sharedTeamMode || waitingForNextRound || remainingApples > 0 || locked) {
      return;
    }

    void onSubmitRound(room.currentRoundIndex, score, clearTimeMs);
  }, [
    clearTimeMs,
    locked,
    onSubmitRound,
    remainingApples,
    room.currentRoundIndex,
    score,
    sharedTeamMode,
    waitingForNextRound
  ]);

  useEffect(() => {
    if (waitingForNextRound || timeLeftMs > 0 || progressRequestedRef.current) {
      return;
    }

    progressRequestedRef.current = true;

    if (sharedTeamMode || locked) {
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
    sharedTeamMode,
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

  function syncTeamPointer(
    boardX: number,
    boardY: number,
    active: boolean,
    dragging: boolean,
    selectionStartX: number,
    selectionStartY: number,
    force = false
  ): void {
    if (!sharedTeamMode || playerTeamId === null || waitingForNextRound) {
      return;
    }

    const lastSync = pointerSyncRef.current;
    const now = Date.now();

    if (
      !force &&
      lastSync &&
      lastSync.active === active &&
      lastSync.dragging === dragging &&
      Math.abs(lastSync.x - boardX) < 8 &&
      Math.abs(lastSync.y - boardY) < 8 &&
      Math.abs(lastSync.selectionStartX - selectionStartX) < 8 &&
      Math.abs(lastSync.selectionStartY - selectionStartY) < 8 &&
      now - lastSync.sentAt < 45
    ) {
      return;
    }

    pointerSyncRef.current = {
      sentAt: now,
      x: boardX,
      y: boardY,
      active,
      dragging,
      selectionStartX,
      selectionStartY
    };
    void onUpdateTeamPointer(
      room.currentRoundIndex,
      boardX,
      boardY,
      active,
      dragging,
      selectionStartX,
      selectionStartY
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (locked || waitingForNextRound || timeLeftMs <= 0) {
      return;
    }

    const { boardX, boardY, displayX, displayY } = getPointerPosition(event);
    syncTeamPointer(boardX, boardY, true, true, boardX, boardY, true);
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
    const { boardX, boardY, displayX, displayY } = getPointerPosition(event);

    if (!dragState || dragState.pointerId !== event.pointerId) {
      syncTeamPointer(boardX, boardY, true, false, boardX, boardY);
      return;
    }

    syncTeamPointer(
      boardX,
      boardY,
      true,
      true,
      dragState.startBoardX,
      dragState.startBoardY
    );

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
    const { boardX, boardY } = getPointerPosition(event);
    syncTeamPointer(boardX, boardY, false, false, boardX, boardY, true);

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const rect = normalizeSelectionRect(
      dragState.startBoardX,
      dragState.startBoardY,
      boardX,
      boardY
    );
    const snapshot = getSelectionSnapshot(rect);

    if (snapshot.sum === 10 && snapshot.apples.length > 0 && timeLeftMs > 0 && !locked) {
      const selectedIds = snapshot.ids;
      const nextClearTimeMs = snapshot.apples.length === remainingApples ? getElapsedRoundMs() : null;

      if (sharedTeamMode) {
        void onSubmitSharedSelection(
          room.currentRoundIndex,
          Array.from(selectedIds),
          nextClearTimeMs
        );
      } else {
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
          setClearTimeMs(nextClearTimeMs);
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
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetSelection();
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLDivElement>): void {
    const { boardX, boardY } = getPointerPosition(event);
    syncTeamPointer(boardX, boardY, false, false, boardX, boardY, true);
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
          <p className={styles.mode}>
            {room.settings.gameMode === "team"
              ? room.settings.teamMode === "shared"
                ? `${room.settings.teamCount}팀 단일 화면`
                : `${room.settings.teamCount}팀 개별 화면`
              : "개인전"}
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
              다음 라운드 찬성 {voteCount} / {consensusPlayerIds.length}
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
            <p className={styles.waitingSummary}>
              현재 접속 중인 인원이 모두 찬성하면 자동으로 다음 라운드가 시작됩니다.
            </p>
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
            score={displayedScore}
            timeLeftMs={timeLeftMs}
            roundDurationSec={room.settings.roundDurationSec}
            selectionRect={selectionRect}
            selectedAppleIds={selectedAppleIds}
            teamPointers={teamPointers}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />

          <section className={styles.scoreboardPanel}>
            <h2 className={styles.scoreboardTitle}>현재 점수판</h2>
            <div className={styles.scoreboardWrap}>
              <table className={styles.scoreboardTable}>
                <thead>
                  <tr>
                    <th>플레이어</th>
                    {room.settings.gameMode === "team" ? <th>팀</th> : null}
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
                        {!entry.connected ? " (오프라인)" : ""}
                      </td>
                      {room.settings.gameMode === "team" ? <td>{entry.teamName}</td> : null}
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

          <p className={styles.hint}>
            {sharedTeamMode
              ? "같은 팀은 공용 보드를 공유하며, 팀원의 포인터와 제거 결과가 실시간으로 반영됩니다."
              : "사과를 정확히 감싸서 숫자 합이 10이 되면 아래로 떨어집니다."}
          </p>
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
                  {room.settings.gameMode === "team" ? <th>팀</th> : null}
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
                      {!entry.connected ? " (오프라인)" : ""}
                    </td>
                    {room.settings.gameMode === "team" ? <td>{entry.teamName}</td> : null}
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
