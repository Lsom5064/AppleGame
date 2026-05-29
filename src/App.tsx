import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { GameScreen } from "./components/GameScreen";
import { HomeScreen } from "./components/HomeScreen";
import { LeaderboardScreen } from "./components/LeaderboardScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { BOARD_WIDTH, PRESENCE_HEARTBEAT_MS } from "./constants";
import { ensureFirebaseIdentity } from "./lib/firebase";
import { realtimeService } from "./services/realtimeService";
import styles from "./styles/App.module.css";
import type { PlayerState, RoomDirectoryState, RoomState, SessionState } from "./types";
import { gameAudio } from "./utils/audio";
import { clearStoredSession, getOrCreateClientId, loadStoredSession, storeSession } from "./utils/client";

const NICKNAME_STORAGE_KEY = "apple-sum-nickname";
const THEME_STORAGE_KEY = "apple-sum-theme";
const SOUND_STORAGE_KEY = "apple-sum-sound";
const SOUND_VOLUME_STORAGE_KEY = "apple-sum-sound-volume";
type IdentityStatus = "loading" | "ready" | "error";
type ThemeMode = "default" | "office";

function getStoredSoundVolume(): number {
  const storedVolume = Number(window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY));
  return Number.isFinite(storedVolume) ? Math.min(100, Math.max(0, storedVolume)) : 32;
}

export default function App() {
  const [nickname, setNickname] = useState(() => window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "");
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.localStorage.getItem(THEME_STORAGE_KEY) === "office" ? "office" : "default"
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => window.localStorage.getItem(SOUND_STORAGE_KEY) === "on"
  );
  const [soundVolume, setSoundVolume] = useState(getStoredSoundVolume);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [createRoomName, setCreateRoomName] = useState("");
  const [createRoomPassword, setCreateRoomPassword] = useState("");
  const [createRoomIsPublic, setCreateRoomIsPublic] = useState(true);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>("loading");
  const [session, setSession] = useState<SessionState | null>(null);
  const [lastKnownPlayer, setLastKnownPlayer] = useState<PlayerState | null>(null);
  const [hasAttemptedSessionRestore, setHasAttemptedSessionRestore] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [hasResolvedRoom, setHasResolvedRoom] = useState(false);
  const [roomDirectoryState, setRoomDirectoryState] = useState<RoomDirectoryState>({
    status: "loading",
    rooms: []
  });
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const appFrameWidth = room
    ? room.phase === "lobby"
      ? BOARD_WIDTH + 460
      : room.phase === "playing" || room.phase === "between-rounds"
        ? BOARD_WIDTH + 460
        : BOARD_WIDTH + 360
    : BOARD_WIDTH;
  const frameStyle = {
    "--app-frame-width": appFrameWidth,
    "--game-board-width": BOARD_WIDTH
  } as CSSProperties;

  useEffect(() => {
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  }, [nickname]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
    gameAudio.setVolume(soundVolume / 100);
    void gameAudio
      .setEnabled(soundEnabled)
      .then(() => {
        gameAudio.setBgmPlaying(soundEnabled);
      })
      .catch(() => {});

    return () => {
      gameAudio.setBgmPlaying(false);
    };
  }, [soundEnabled, soundVolume]);

  useEffect(() => {
    window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundVolume));
    gameAudio.setVolume(soundVolume / 100);
  }, [soundVolume]);

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
    if (identityStatus !== "ready" || !playerId || hasAttemptedSessionRestore) {
      return;
    }

    const storedSession = loadStoredSession();

    if (storedSession?.playerId === playerId) {
      setSession(storedSession);
      setRoomCodeInput(storedSession.roomCode);
    } else if (storedSession) {
      clearStoredSession();
    }

    setHasAttemptedSessionRestore(true);
  }, [hasAttemptedSessionRestore, identityStatus, playerId]);

  useEffect(() => {
    if (!hasAttemptedSessionRestore) {
      return;
    }

    if (session) {
      storeSession(session);
      return;
    }

    clearStoredSession();
  }, [hasAttemptedSessionRestore, session]);

  useEffect(() => {
    if (!session) {
      setRoom(null);
      setLastKnownPlayer(null);
      setHasResolvedRoom(false);
      return;
    }

    setHasResolvedRoom(false);
    return realtimeService.subscribeToRoom(session.roomCode, (nextRoom) => {
      setHasResolvedRoom(true);
      setRoom(nextRoom);

      if (nextRoom?.players[session.playerId]) {
        setLastKnownPlayer(nextRoom.players[session.playerId]);
      }

      if (!nextRoom) {
        setError("방이 존재하지 않거나 종료되었습니다.");
        setSession(null);
        clearStoredSession();
      }
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    const sendPresence = (connected: boolean) => {
      if (cancelled) {
        return;
      }

      void realtimeService.updatePresence(session.roomCode, session.playerId, connected).catch(() => {});
    };

    sendPresence(true);

    const heartbeat = window.setInterval(() => {
      sendPresence(true);
    }, PRESENCE_HEARTBEAT_MS);

    const handleVisibility = () => {
      sendPresence(document.visibilityState === "visible");
    };

    window.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("visibilitychange", handleVisibility);
      void realtimeService.updatePresence(session.roomCode, session.playerId, false).catch(() => {});
    };
  }, [session]);

  const player =
    session && room
      ? room.players[session.playerId] ?? (lastKnownPlayer?.id === session.playerId ? lastKnownPlayer : null)
      : null;

  useEffect(() => {
    if (session) {
      setRoomDirectoryState({
        status: "loading",
        rooms: []
      });
      return;
    }

    return realtimeService.subscribeToRoomDirectory((nextRoomDirectoryState) => {
      setRoomDirectoryState(nextRoomDirectoryState);
    });
  }, [session]);

  useEffect(() => {
    if (!session || !hasResolvedRoom || !room) {
      return;
    }

    if (!room.players[session.playerId] && !lastKnownPlayer) {
      setError("현재 방에서 플레이어 정보를 찾을 수 없습니다.");
      setSession(null);
      setRoom(null);
      clearStoredSession();
    }
  }, [hasResolvedRoom, lastKnownPlayer, room, session]);

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
      const roomCode = await realtimeService.createRoom(assertNickname(), nextPlayerId, {
        name: createRoomName,
        password: createRoomPassword,
        isPublic: createRoomIsPublic
      });
      setSession({ roomCode, playerId: nextPlayerId });
      setJoinPassword("");
    });
  }

  async function handleJoinRoom(): Promise<void> {
    const trimmedRoomCode = roomCodeInput.trim().toUpperCase();
    await handleJoinRoomByCode(trimmedRoomCode, joinPassword);
  }

  async function handleJoinRoomByCode(roomCode: string, password = ""): Promise<void> {
    await runWithBusy(async () => {
      const trimmedRoomCode = roomCode.trim().toUpperCase();
      if (!trimmedRoomCode) {
        throw new Error("방 코드를 입력해주세요.");
      }

      const nextPlayerId = assertPlayerId();
      await realtimeService.joinRoom(trimmedRoomCode, assertNickname(), nextPlayerId, password);
      setSession({ roomCode: trimmedRoomCode, playerId: nextPlayerId });
      setRoomCodeInput(trimmedRoomCode);
      setJoinPassword("");
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
      setJoinPassword("");
    });
  }

  function handleSoundToggle(): void {
    setSoundEnabled((current) => {
      const nextEnabled = !current;
      void gameAudio
        .setEnabled(nextEnabled)
        .then(() => {
          gameAudio.setBgmPlaying(nextEnabled);
        })
        .catch(() => {});
      return nextEnabled;
    });
  }

  const topControls = (
    <div className={styles.themeBar}>
      <span className={styles.themeLabel}>테마</span>
      <button
        className={styles.themeToggle}
        type="button"
        onClick={() => setTheme((current) => (current === "office" ? "default" : "office"))}
      >
        {theme === "office" ? "엑셀" : "기본"}
      </button>
      <span className={styles.themeLabel}>사운드</span>
      <button className={styles.themeToggle} type="button" onClick={handleSoundToggle}>
        {soundEnabled ? "켜짐" : "꺼짐"}
      </button>
      <label className={styles.volumeControl}>
        <span className={styles.themeLabel}>볼륨 {soundVolume}%</span>
        <input
          className={styles.volumeSlider}
          type="range"
          min="0"
          max="100"
          step="1"
          value={soundVolume}
          onChange={(event) => setSoundVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );

  if (session && !hasResolvedRoom) {
    return (
      <main className={styles.app} data-theme={theme}>
        <div className={styles.frame} style={frameStyle}>
          {topControls}
          <div className={styles.loading}>방 정보를 불러오는 중입니다.</div>
        </div>
      </main>
    );
  }

  if (identityStatus === "loading") {
    return (
      <main className={styles.app} data-theme={theme}>
        <div className={styles.frame} style={frameStyle}>
          {topControls}
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
    <main className={styles.app} data-theme={theme}>
      <div className={styles.frame} style={frameStyle}>
        {topControls}

        {error ? <div className={styles.error}>{error}</div> : null}

        {!session ? (
          <HomeScreen
            nickname={nickname}
            roomCode={roomCodeInput}
            joinPassword={joinPassword}
            createRoomName={createRoomName}
            createRoomPassword={createRoomPassword}
            createRoomIsPublic={createRoomIsPublic}
            roomDirectoryState={roomDirectoryState}
            onNicknameChange={setNickname}
            onRoomCodeChange={setRoomCodeInput}
            onJoinPasswordChange={setJoinPassword}
            onCreateRoomNameChange={setCreateRoomName}
            onCreateRoomPasswordChange={setCreateRoomPassword}
            onCreateRoomIsPublicChange={setCreateRoomIsPublic}
            onCreateRoom={() => void handleCreateRoom()}
            onJoinRoom={() => void handleJoinRoom()}
            onJoinListedRoom={(nextRoomCode, password) => void handleJoinRoomByCode(nextRoomCode, password)}
          />
        ) : room && player && room.phase === "lobby" ? (
          <LobbyScreen
            room={room}
            player={player}
            onLeaveRoom={() => void handleLeaveRoom()}
            onSendChatMessage={(text) => realtimeService.sendChatMessage(room.code, player.id, text)}
            onUpdateSettings={(settings) =>
              void runWithBusy(() => realtimeService.updateSettings(room.code, player.id, settings))
            }
            onRandomizeTeams={() => void runWithBusy(() => realtimeService.randomizeTeams(room.code, player.id))}
            onAssignPlayerTeam={(targetPlayerId, teamId) =>
              void runWithBusy(() =>
                realtimeService.assignPlayerTeam(room.code, player.id, targetPlayerId, teamId)
              )
            }
            onStartGame={() => void runWithBusy(() => realtimeService.startGame(room.code, player.id))}
          />
        ) : room && player && (room.phase === "playing" || room.phase === "between-rounds") ? (
          <GameScreen
            key={`${room.phase}:${room.currentRoundIndex}:${room.roundStartedAt ?? "paused"}:${player.id}`}
            room={room}
            player={player}
            officeTheme={theme === "office"}
            onLeaveRoom={() => void handleLeaveRoom()}
            onVoteNextRound={() => runWithBusy(() => realtimeService.voteForNextRound(room.code, player.id))}
            onSendChatMessage={(text) => realtimeService.sendChatMessage(room.code, player.id, text)}
            onSubmitRound={(roundIndex, score, clearTimeMs) =>
              realtimeService.submitRoundScore(room.code, player.id, roundIndex, score, clearTimeMs)
            }
            onUpdateLiveScore={(roundIndex, score) =>
              realtimeService.updateLiveScore(room.code, player.id, roundIndex, score)
            }
            onSubmitSharedSelection={(roundIndex, appleIds, clearTimeMs) =>
              realtimeService.submitSharedSelection(room.code, player.id, roundIndex, appleIds, clearTimeMs)
            }
            onUpdateTeamPointer={(teamId, roundIndex, x, y, active, dragging, selectionStartX, selectionStartY) =>
              realtimeService.updateTeamPointer(
                room.code,
                player.id,
                teamId,
                roundIndex,
                x,
                y,
                active,
                dragging,
                selectionStartX,
                selectionStartY
              )
            }
            onForceProgress={() => realtimeService.forceRoundProgress(room.code)}
          />
        ) : room && player ? (
          <LeaderboardScreen
            room={room}
            player={player}
            onLeaveRoom={() => void handleLeaveRoom()}
            onSendChatMessage={(text) => realtimeService.sendChatMessage(room.code, player.id, text)}
            onRestartGame={() => runWithBusy(() => realtimeService.startGame(room.code, player.id))}
          />
        ) : null}

        {isBusy ? <div className={styles.status}>동기화 중...</div> : null}
      </div>
    </main>
  );
}
