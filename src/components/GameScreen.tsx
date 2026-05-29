import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, POINTER_STALE_MS } from "../constants";
import type { Apple, PlayerState, RoomState, SelectionRect } from "../types";
import { generateApples, isAppleInsideRect, normalizeSelectionRect } from "../utils/gameBoard";
import { getConnectedPlayerIds, isPlayerConnected } from "../utils/presence";
import { getRealtimeNow } from "../utils/realtimeClock";
import { getRoundCountdownMs, getRoundElapsedPlayMs, getRoundTimeLeftMs } from "../utils/roundTiming";
import { calculateSelectionScore } from "../utils/scoring";
import { getTeamName } from "../utils/teams";
import { GameBoard } from "./GameBoard";
import { RoomChat } from "./RoomChat";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  room: RoomState;
  player: PlayerState;
  officeTheme: boolean;
  onLeaveRoom: () => void;
  onVoteNextRound: () => Promise<void>;
  onSendChatMessage: (text: string) => Promise<void>;
  onSubmitRound: (roundIndex: number, score: number, clearTimeMs: number | null) => Promise<void>;
  onUpdateLiveScore: (roundIndex: number, score: number) => Promise<void>;
  onSubmitSharedSelection: (
    roundIndex: number,
    appleIds: string[],
    clearTimeMs: number | null
  ) => Promise<void>;
  onUpdateTeamPointer: (
    teamId: string,
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
  startX: number;
  startY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const POINTER_SYNC_PIXEL_THRESHOLD = 2;
const POINTER_SYNC_INTERVAL_MS = 16;

interface PointerPosition {
  x: number;
  y: number;
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
  officeTheme,
  onLeaveRoom,
  onVoteNextRound,
  onSendChatMessage,
  onSubmitRound,
  onUpdateLiveScore,
  onSubmitSharedSelection,
  onUpdateTeamPointer,
  onForceProgress
}: GameScreenProps) {
  const currentPlayer = room.players[player.id] ?? player;
  const roundSeed = `${room.seed}:${room.currentRoundIndex}`;
  const roundKey = String(room.currentRoundIndex);
  const sharedTeamMode = room.settings.gameMode === "team" && room.settings.teamMode === "shared";
  const playerTeamId = currentPlayer.teamId;
  const sharedTeamBoard =
    sharedTeamMode && playerTeamId ? room.sharedTeamBoards[roundKey]?.[playerTeamId] ?? null : null;
  const waitingForNextRound = room.phase === "between-rounds";
  const locked = waitingForNextRound ? false : Boolean(room.submissions[roundKey]?.[currentPlayer.id]);
  const activeRoundNumber = waitingForNextRound ? room.currentRoundIndex + 2 : room.currentRoundIndex + 1;
  const lastRoundSubmission =
    waitingForNextRound ? room.submissions[roundKey]?.[currentPlayer.id] ?? null : null;
  const [apples, setApples] = useState<Apple[]>(() => generateApples(roundSeed));
  const [score, setScore] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedAppleIds, setSelectedAppleIds] = useState<Set<string>>(() => new Set());
  const [timeLeftMs, setTimeLeftMs] = useState(() =>
    getRoundTimeLeftMs(room.roundStartedAt, room.settings.roundDurationSec, getRealtimeNow())
  );
  const [countdownMs, setCountdownMs] = useState(() => getRoundCountdownMs(room.roundStartedAt, getRealtimeNow()));
  const [lightColors, setLightColors] = useState(false);
  const [clearTimeMs, setClearTimeMs] = useState<number | null>(null);
  const [pointerNow, setPointerNow] = useState(() => getRealtimeNow());
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
  const liveScoreSyncRef = useRef<{
    roundIndex: number;
    score: number;
    roundStartedAt: number | null;
  } | null>(null);

  const remainingApples = useMemo(
    () => apples.filter((apple) => !apple.removed && !apple.dropping).length,
    [apples]
  );
  const isCountingDown = room.phase === "playing" && countdownMs > 0;
  const displayedScore = sharedTeamMode ? sharedTeamBoard?.score ?? 0 : score;
  const connectedPlayerIds = getConnectedPlayerIds(room);
  const consensusPlayerIds = connectedPlayerIds.length > 0 ? connectedPlayerIds : Object.keys(room.players);
  const voteCount = consensusPlayerIds.filter((id) => room.nextRoundVotes[id]).length;
  const playerIds = Object.keys(room.players);
  const hasVotedForNextRound = Boolean(room.nextRoundVotes[currentPlayer.id]);
  const voters = playerIds
    .filter((id) => room.nextRoundVotes[id])
    .map((id) => room.players[id]?.nickname ?? id);
  const teamPointers = useMemo(
    () =>
      sharedTeamMode && playerTeamId
        ? Object.values(room.teamPointers)
            .filter(
              (pointer) =>
                pointer.playerId !== currentPlayer.id &&
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
    [
      currentPlayer.id,
      playerTeamId,
      pointerNow,
      room.currentRoundIndex,
      room.players,
      room.teamPointers,
      sharedTeamMode
    ]
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

          if (member.id === currentPlayer.id) {
            return score;
          }

          const liveScore = room.liveScores[String(currentRoundIndex)]?.[member.id];

          if (liveScore !== undefined) {
            return liveScore;
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
    currentPlayer.id,
    room.currentRoundIndex,
    room.players,
    room.settings.gameMode,
    room.settings.roundCount,
    room.liveScores,
    room.sharedTeamBoards,
    room.submissions,
    room.teams,
    score,
    sharedTeamMode,
    waitingForNextRound
  ]);
  const scoreboardTitle = waitingForNextRound ? "전체 점수판" : "현재 점수판";
  const chatTitle = waitingForNextRound ? "라운드 대기 채팅" : "게임 채팅";
  const boardModeDescription =
    room.settings.gameMode === "team"
      ? sharedTeamMode
        ? "보드 공유 모드: 같은 팀은 하나의 보드를 함께 사용하고, 팀원의 포인터와 드래그 범위, 제거 결과가 실시간으로 반영됩니다."
        : "개인 보드 모드: 각자 보드에서 플레이하고, 라운드 종료 후 팀 점수가 합산됩니다."
      : "사과를 정확히 감싸서 숫자 합이 10이 되면 아래로 떨어집니다.";
  const scoreboardMeta = sharedTeamMode
    ? "보드 공유 점수 반영"
    : room.settings.gameMode === "team"
      ? "개인 보드 라운드별 실시간 집계"
      : "라운드별 실시간 집계";

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
    setScore(room.submissions[roundKey]?.[currentPlayer.id]?.score ?? 0);
    setClearTimeMs(
      sharedTeamMode
        ? sharedTeamBoard?.clearTimeMs ?? null
        : room.submissions[roundKey]?.[currentPlayer.id]?.clearTimeMs ?? null
    );
    setDragState(null);
    setSelectionRect(null);
    setSelectedAppleIds(new Set());
    const now = getRealtimeNow();
    setCountdownMs(getRoundCountdownMs(room.roundStartedAt, now));
    setTimeLeftMs(getRoundTimeLeftMs(room.roundStartedAt, room.settings.roundDurationSec, now));
    pointerSyncRef.current = null;
  }, [
    currentPlayer.id,
    playerTeamId,
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

      const now = getRealtimeNow();
      setCountdownMs(getRoundCountdownMs(room.roundStartedAt, now));
      setTimeLeftMs(getRoundTimeLeftMs(room.roundStartedAt, room.settings.roundDurationSec, now));
    }, 200);

    return () => window.clearInterval(interval);
  }, [room.roundStartedAt, room.settings.roundDurationSec]);

  useEffect(() => {
    if (!sharedTeamMode) {
      return;
    }

    const interval = window.setInterval(() => {
      setPointerNow(getRealtimeNow());
    }, 250);

    return () => window.clearInterval(interval);
  }, [sharedTeamMode]);

  useEffect(() => {
    if (sharedTeamMode || room.phase !== "playing" || locked) {
      return;
    }

    const lastSync = liveScoreSyncRef.current;
    if (
      lastSync &&
      lastSync.roundIndex === room.currentRoundIndex &&
      lastSync.score === score &&
      lastSync.roundStartedAt === room.roundStartedAt
    ) {
      return;
    }

    liveScoreSyncRef.current = {
      roundIndex: room.currentRoundIndex,
      score,
      roundStartedAt: room.roundStartedAt
    };
    void onUpdateLiveScore(room.currentRoundIndex, score);
  }, [
    locked,
    onUpdateLiveScore,
    room.currentRoundIndex,
    room.phase,
    room.roundStartedAt,
    score,
    sharedTeamMode
  ]);

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
    if (waitingForNextRound || isCountingDown || timeLeftMs > 0) {
      return;
    }

    const requestProgress = () => {
      if (sharedTeamMode || locked) {
        void onForceProgress();
        return;
      }

      void onSubmitRound(room.currentRoundIndex, score, clearTimeMs);
    };

    requestProgress();
    const retryId = window.setInterval(requestProgress, 1000);

    return () => {
      window.clearInterval(retryId);
    };
  }, [
    clearTimeMs,
    locked,
    onForceProgress,
    onSubmitRound,
    room.currentRoundIndex,
    score,
    sharedTeamMode,
    isCountingDown,
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

    return getRoundElapsedPlayMs(room.roundStartedAt, getRealtimeNow());
  }

  function getPointerPosition(event: ReactPointerEvent<HTMLDivElement>): PointerPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, BOARD_WIDTH);
    const y = clamp(event.clientY - rect.top, 0, BOARD_HEIGHT);
    return { x, y };
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
    if (!sharedTeamMode || playerTeamId === null || waitingForNextRound || isCountingDown) {
      return;
    }

    const lastSync = pointerSyncRef.current;
    const now = getRealtimeNow();

    if (
      !force &&
      lastSync &&
      lastSync.active === active &&
      lastSync.dragging === dragging &&
      Math.abs(lastSync.x - boardX) < POINTER_SYNC_PIXEL_THRESHOLD &&
      Math.abs(lastSync.y - boardY) < POINTER_SYNC_PIXEL_THRESHOLD &&
      Math.abs(lastSync.selectionStartX - selectionStartX) < POINTER_SYNC_PIXEL_THRESHOLD &&
      Math.abs(lastSync.selectionStartY - selectionStartY) < POINTER_SYNC_PIXEL_THRESHOLD &&
      now - lastSync.sentAt < POINTER_SYNC_INTERVAL_MS
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
      playerTeamId,
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
    if (locked || waitingForNextRound || isCountingDown || timeLeftMs <= 0) {
      return;
    }

    const { x, y } = getPointerPosition(event);
    syncTeamPointer(x, y, true, true, x, y, true);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: x,
      startY: y
    });
    setSelectionRect(normalizeSelectionRect(x, y, x, y));
    setSelectedAppleIds(new Set());
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const { x, y } = getPointerPosition(event);

    if (!dragState || dragState.pointerId !== event.pointerId) {
      syncTeamPointer(x, y, true, false, x, y);
      return;
    }

    syncTeamPointer(
      x,
      y,
      true,
      true,
      dragState.startX,
      dragState.startY
    );

    const boardRect = normalizeSelectionRect(
      dragState.startX,
      dragState.startY,
      x,
      y
    );
    const snapshot = getSelectionSnapshot(boardRect);

    setSelectionRect(boardRect);
    startTransition(() => {
      setSelectedAppleIds(snapshot.ids);
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const { x, y } = getPointerPosition(event);
    syncTeamPointer(x, y, false, false, x, y, true);

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const rect = normalizeSelectionRect(
      dragState.startX,
      dragState.startY,
      x,
      y
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
    const { x, y } = getPointerPosition(event);
    syncTeamPointer(x, y, false, false, x, y, true);
  }

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div className={styles.headerPrimary}>
          <p className={styles.meta}>Room {room.code}</p>
          <p className={styles.player}>Player {player.nickname}</p>
          <p className={styles.round}>
            Round {activeRoundNumber} / {room.settings.roundCount}
          </p>
          <p className={styles.mode}>
            {room.settings.gameMode === "team"
              ? room.settings.teamMode === "shared"
                ? `${room.settings.teamCount}팀 보드 공유`
                : `${room.settings.teamCount}팀 개인 보드`
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

      <div className={styles.gameArea}>
        <div className={styles.primaryColumn}>
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
            </div>
          ) : (
            <>
              <div className={styles.boardCard}>
                <GameBoard
                  apples={apples}
                  officeTheme={officeTheme}
                  locked={locked}
                  lightColors={lightColors}
                  score={displayedScore}
                  countdownMs={countdownMs}
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
              </div>
              <div className={styles.boardNote}>
                <p className={styles.hint}>{boardModeDescription}</p>
              </div>
            </>
          )}
        </div>

        <aside className={styles.sidebar}>
          <section className={styles.scoreboardPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.scoreboardTitle}>{scoreboardTitle}</h2>
              <p className={styles.panelMeta}>{scoreboardMeta}</p>
            </div>
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

          <RoomChat
            className={styles.gameChat}
            player={player}
            messages={room.chatMessages}
            title={chatTitle}
            onSendMessage={onSendChatMessage}
          />
        </aside>
      </div>
    </div>
  );
}
