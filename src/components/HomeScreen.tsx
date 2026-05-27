import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  nickname: string;
  roomCode: string;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export function HomeScreen({
  nickname,
  roomCode,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom
}: HomeScreenProps) {
  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Fruit Box Multiplayer</h1>
        <p className={styles.description}>숫자 합이 10이 되도록 사과를 드래그하세요.</p>
        <p className={styles.note}>방을 만들거나 방 코드로 입장해 같은 배치에서 동시에 플레이합니다.</p>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>새 방 만들기</h2>
          <p className={styles.panelText}>닉네임을 입력한 뒤 시작합니다.</p>
          <label className={styles.label}>
            닉네임
            <input
              className={styles.input}
              maxLength={20}
              placeholder="닉네임 입력"
              value={nickname}
              onChange={(event) => onNicknameChange(event.target.value)}
            />
          </label>
          <button className={styles.button} type="button" onClick={onCreateRoom}>
            방 만들기
          </button>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>방 참여하기</h2>
          <p className={styles.panelText}>공유받은 방 코드로 참가합니다.</p>
          <label className={styles.label}>
            방 코드
            <input
              className={styles.input}
              maxLength={6}
              placeholder="방 코드 입력"
              value={roomCode}
              onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
            />
          </label>
          <button className={styles.secondaryButton} type="button" onClick={onJoinRoom}>
            방 참여하기
          </button>
        </section>
      </div>

      <section className={styles.rules}>
        <p>제한시간은 120초입니다.</p>
        <p>사과 1개당 1점입니다.</p>
        <p>방장은 로비에서 1판, 3판, 5판과 리더보드 기준을 정할 수 있습니다.</p>
        <p>모든 참가자는 같은 배치에서 동시에 플레이합니다.</p>
      </section>
    </div>
  );
}
