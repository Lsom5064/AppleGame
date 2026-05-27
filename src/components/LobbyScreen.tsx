import type { GameSettings, PlayerState, RoomState } from "../types";
import { RoomChat } from "./RoomChat";
import styles from "./LobbyScreen.module.css";

interface LobbyScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onSendChatMessage: (text: string) => Promise<void>;
  onUpdateSettings: (
    settings: Partial<Pick<GameSettings, "roundCount" | "leaderboardMode">>
  ) => void;
  onStartGame: () => void;
}

function getLeaderboardModeLabel(mode: GameSettings["leaderboardMode"]): string {
  return mode === "best" ? "N판 중 최고점" : "N판 점수 합계";
}

export function LobbyScreen({
  room,
  player,
  onLeaveRoom,
  onSendChatMessage,
  onUpdateSettings,
  onStartGame
}: LobbyScreenProps) {
  const isHost = room.hostId === player.id;
  const players = Object.values(room.players);

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Room {room.code}</h1>
          <p className={styles.description}>참가자 {players.length}명</p>
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.ghostButton} type="button" onClick={onLeaveRoom}>
            나가기
          </button>
          {isHost ? (
            <button className={styles.button} type="button" onClick={onStartGame}>
              게임 시작
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>참가자</h2>
          <ul className={styles.list}>
            {players.map((member) => (
              <li key={member.id} className={styles.playerRow}>
                <span>{member.nickname}</span>
                {member.isHost ? <span className={styles.badge}>방장</span> : null}
              </li>
            ))}
          </ul>

          <h2 className={styles.panelTitle}>게임 모드</h2>
          <div className={styles.settings}>
            <div className={styles.settingBlock}>
              <p className={styles.settingLabel}>판 수</p>
              <div className={styles.optionRow}>
                {[1, 3, 5].map((roundCount) => (
                  <label key={roundCount} className={styles.option}>
                    <input
                      checked={room.settings.roundCount === roundCount}
                      disabled={!isHost}
                      name="roundCount"
                      type="radio"
                      onChange={() =>
                        onUpdateSettings({
                          roundCount: roundCount as GameSettings["roundCount"]
                        })
                      }
                    />
                    <span>{roundCount}판</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.settingBlock}>
              <p className={styles.settingLabel}>리더보드 기준</p>
              <div className={styles.optionColumn}>
                <label className={styles.option}>
                  <input
                    checked={room.settings.leaderboardMode === "sum"}
                    disabled={!isHost}
                    name="leaderboardMode"
                    type="radio"
                    onChange={() => onUpdateSettings({ leaderboardMode: "sum" })}
                  />
                  <span>N판 점수 합계</span>
                </label>
                <label className={styles.option}>
                  <input
                    checked={room.settings.leaderboardMode === "best"}
                    disabled={!isHost}
                    name="leaderboardMode"
                    type="radio"
                    onChange={() => onUpdateSettings({ leaderboardMode: "best" })}
                  />
                  <span>N판 중 최고점</span>
                </label>
              </div>
            </div>

            <p className={styles.rule}>
              현재 설정: {room.settings.roundCount}판 / {getLeaderboardModeLabel(room.settings.leaderboardMode)}
            </p>
          </div>

          <h2 className={styles.panelTitle}>게임 규칙</h2>
          <div className={styles.settings}>
            <p className={styles.rule}>제한시간은 120초입니다.</p>
            <p className={styles.rule}>드래그한 범위의 숫자 합이 10이면 사과가 제거됩니다.</p>
            <p className={styles.rule}>사과 1개당 1점이며, 모두 제거하면 클리어 시간이 기록됩니다.</p>
            <p className={styles.hint}>{isHost ? "방장이 모드를 정하고 시작합니다." : "방장이 모드를 정할 때까지 대기합니다."}</p>
          </div>
        </section>
      </div>

      <RoomChat
        player={player}
        messages={room.chatMessages}
        title="대기실 채팅"
        onSendMessage={onSendChatMessage}
      />
    </div>
  );
}
