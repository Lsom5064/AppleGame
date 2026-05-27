import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { GameScreen } from "./components/GameScreen";
import { HomeScreen } from "./components/HomeScreen";
import { LeaderboardScreen } from "./components/LeaderboardScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { BOARD_WIDTH } from "./constants";
import { ensureFirebaseIdentity } from "./lib/firebase";
import { realtimeService } from "./services/realtimeService";
import styles from "./styles/App.module.css";
import type { RoomState, SessionState } from "./types";
import { getOrCreateClientId } from "./utils/client";

const NICKNAME_STORAGE_KEY = "apple-sum-nickname";
type IdentityStatus = "loading" | "ready" | "error";

export default function App() {
  const frameStyle = {
    "--app-frame-width": BOARD_WIDTH
  } as CSSProperties;
  const [nickname, setNickname] = useState(() => window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>("loading");
  const [session, setSession] = useState<SessionState | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [hasResolvedRoom, setHasResolvedRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  }, [nickname]);

  useEffect(() => {
    let cancelled = false;

    async function resolveIdentity(): Promise<void> {
      try {
        if (realtimeService.providerName === "firebase") {
          const firebaseUid = await ensureFirebaseIdentity();

          if (!firebaseUid) {
            throw new Error("Firebase 익명 인증에 실패했습니다.");
          }

          if (!cancelled) {
            setPlayerId(firebaseUid);
            setIdentityStatus("ready");
          }

          return;
        }

        if (!cancelled) {
          setPlayerId(getOrCreateClientId());
          setIdentityStatus("ready");
        }
      } catch (caughtError) {
        if (!cancelled) {
          setIdentityStatus("error");
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "플레이어 세션을 초기화하지 못했습니다."
          );
        }
      }
    }

    void resolveIdentity();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setRoom(null);
      setHasResolvedRoom(false);
      return;
    }

    setHasResolvedRoom(false);
    return realtimeService.subscribeToRoom(session.roomCode, (nextRoom) => {
      setHasResolvedRoom(true);
      setRoom(nextRoom);

      if (!nextRoom) {
        setError("방이 존재하지 않거나 종료되었습니다.");
        setSession(null);
      }
    });
  }, [session]);

  const player = session && room ? room.players[session.playerId] : null;

  useEffect(() => {
    if (!session || !hasResolvedRoom || !room) {
      return;
    }

    if (!room.players[session.playerId]) {
      setError("현재 방에서 플레이어 정보를 찾을 수 없습니다.");
      setSession(null);
      setRoom(null);
    }
  }, [hasResolvedRoom, room, session]);

  async function runWithBusy(task: () => Promise<void>): Promise<void> {
    try {
      setIsBusy(true);
      setError(null);
      await task();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }

  function assertNickname(): string {
    const trimmed = nickname.trim();
    if (!trimmed) {
      throw new Error("닉네임을 먼저 입력해주세요.");
    }
    return trimmed;
  }

  function assertPlayerId(): string {
    if (!playerId) {
      throw new Error("플레이어 세션이 아직 준비되지 않았습니다.");
    }

    return playerId;
  }

  async function handleCreateRoom(): Promise<void> {
    await runWithBusy(async () => {
      const nextPlayerId = assertPlayerId();
      const roomCode = await realtimeService.createRoom(assertNickname(), nextPlayerId);
      setSession({ roomCode, playerId: nextPlayerId });
    });
  }

  async function handleJoinRoom(): Promise<void> {
    await runWithBusy(async () => {
      const trimmedRoomCode = roomCodeInput.trim().toUpperCase();
      if (!trimmedRoomCode) {
        throw new Error("방 코드를 입력해주세요.");
      }

      const nextPlayerId = assertPlayerId();
      await realtimeService.joinRoom(trimmedRoomCode, assertNickname(), nextPlayerId);
      setSession({ roomCode: trimmedRoomCode, playerId: nextPlayerId });
    });
  }

  async function handleLeaveRoom(): Promise<void> {
    const currentSession = session;
    if (!currentSession) {
      return;
    }

    await runWithBusy(async () => {
      await realtimeService.leaveRoom(currentSession.roomCode, currentSession.playerId);
      setSession(null);
      setRoom(null);
      setRoomCodeInput("");
    });
  }

  if (session && !hasResolvedRoom) {
    return (
      <main className={styles.app}>
        <div className={styles.frame} style={frameStyle}>
          <div className={styles.loading}>방 정보를 불러오는 중입니다.</div>
        </div>
      </main>
    );
  }

  if (identityStatus === "loading") {
    return (
      <main className={styles.app}>
        <div className={styles.frame} style={frameStyle}>
          <div className={styles.loading}>
            {realtimeService.providerName === "firebase"
              ? "Firebase 세션을 준비하는 중입니다."
              : "플레이어 세션을 준비하는 중입니다."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.app}>
      <div className={styles.frame} style={frameStyle}>
        {error ? <div className={styles.error}>{error}</div> : null}

        {!session ? (
          <HomeScreen
            nickname={nickname}
            roomCode={roomCodeInput}
            onNicknameChange={setNickname}
            onRoomCodeChange={setRoomCodeInput}
            onCreateRoom={() => void handleCreateRoom()}
            onJoinRoom={() => void handleJoinRoom()}
          />
        ) : room && player && room.phase === "lobby" ? (
          <LobbyScreen
            room={room}
            player={player}
            onLeaveRoom={() => void handleLeaveRoom()}
            onUpdateSettings={(settings) =>
              void runWithBusy(() => realtimeService.updateSettings(room.code, player.id, settings))
            }
            onStartGame={() => void runWithBusy(() => realtimeService.startGame(room.code, player.id))}
          />
        ) : room && player && (room.phase === "playing" || room.phase === "between-rounds") ? (
          <GameScreen
            key={`${room.phase}:${room.currentRoundIndex}:${room.roundStartedAt ?? "paused"}:${player.id}`}
            room={room}
            player={player}
            onLeaveRoom={() => void handleLeaveRoom()}
            onStartNextRound={() =>
              runWithBusy(() => realtimeService.startNextRound(room.code, player.id))
            }
            onSubmitRound={(roundIndex, score, clearTimeMs) =>
              realtimeService.submitRoundScore(room.code, player.id, roundIndex, score, clearTimeMs)
            }
            onForceProgress={() => realtimeService.forceRoundProgress(room.code)}
          />
        ) : room && player ? (
          <LeaderboardScreen
            room={room}
            player={player}
            onLeaveRoom={() => void handleLeaveRoom()}
            onRestartGame={() => runWithBusy(() => realtimeService.startGame(room.code, player.id))}
          />
        ) : null}

        {isBusy ? <div className={styles.status}>동기화 중...</div> : null}
      </div>
    </main>
  );
}
