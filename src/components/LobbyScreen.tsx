import type { PlayerState, RoomState } from "../types";
import styles from "./LobbyScreen.module.css";

interface LobbyScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onStartGame: () => void;
}

export function LobbyScreen({ room, player, onLeaveRoom, onStartGame }: LobbyScreenProps) {
  const isHost = room.hostId === player.id;
  const players = Object.values(room.players);

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>게임 시작 대기 중</h1>
          <p className={styles.description}>
            Room {room.code} / 참가자 {players.length}명
          </p>
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
            {players.map((member) => (
              <div key={member.id} className={styles.playerRow}>
                <span>{member.nickname}</span>
                {member.isHost ? <span className={styles.badge}>방장</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>게임 규칙</h2>
          <div className={styles.settings}>
            <p className={styles.rule}>제한시간은 120초입니다.</p>
            <p className={styles.rule}>드래그한 범위의 숫자 합이 10이면 사과가 제거됩니다.</p>
            <p className={styles.rule}>사과 1개당 1점이며, 모두 제거하면 클리어 시간이 기록됩니다.</p>
            <p className={styles.hint}>
              {isHost
                ? "시작 버튼을 누르면 모든 참가자가 같은 배치로 동시에 시작합니다."
                : "방장이 시작하면 같은 배치로 동시에 게임이 시작됩니다."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
