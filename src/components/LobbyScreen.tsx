import type { PlayerState, RoomState } from "../types";
import styles from "./LobbyScreen.module.css";

interface LobbyScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onUpdateRoundCount: (value: RoomState["settings"]["roundCount"]) => void;
  onUpdateLeaderboardMode: (value: RoomState["settings"]["leaderboardMode"]) => void;
  onStartGame: () => void;
}

export function LobbyScreen({
  room,
  player,
  onLeaveRoom,
  onUpdateRoundCount,
  onUpdateLeaderboardMode,
  onStartGame
}: LobbyScreenProps) {
  const isHost = room.hostId === player.id;

  return (
    <div className={styles.layout}>
      <div className={styles.topBar}>
        <div className={styles.roomCode}>
          <span>ROOM</span>
          <strong>{room.code}</strong>
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
          <div className={styles.list}>
            {Object.values(room.players).map((member) => (
              <div key={member.id} className={styles.playerRow}>
                <span>{member.nickname}</span>
                {member.isHost ? <span className={styles.badge}>방장</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>게임 설정</h2>
          <div className={styles.settings}>
            <label className={styles.field}>
              총 라운드
              <select
                className={styles.select}
                disabled={!isHost}
                value={room.settings.roundCount}
                onChange={(event) =>
                  onUpdateRoundCount(Number(event.target.value) as RoomState["settings"]["roundCount"])
                }
              >
                <option value={1}>1판</option>
                <option value={3}>3판</option>
                <option value={5}>5판</option>
              </select>
            </label>

            <label className={styles.field}>
              리더보드 방식
              <select
                className={styles.select}
                disabled={!isHost}
                value={room.settings.leaderboardMode}
                onChange={(event) =>
                  onUpdateLeaderboardMode(
                    event.target.value as RoomState["settings"]["leaderboardMode"]
                  )
                }
              >
                <option value="sum">sum: 모든 판 점수 합계</option>
                <option value="best">best: 최고 점수 1개</option>
              </select>
            </label>

            <p className={styles.hint}>
              {isHost
                ? "설정을 바꾼 뒤 시작 버튼을 누르면 전원이 같은 시드로 게임을 시작합니다."
                : "방장이 설정을 조정하면 이 화면에 실시간으로 반영됩니다."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
