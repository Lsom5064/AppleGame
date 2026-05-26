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
        <span className={styles.eyebrow}>Fruit Box Multiplayer</span>
        <h1 className={styles.title}>숫자 합이 10이 되도록 사과를 드래그하세요</h1>
        <p className={styles.description}>
          원본 Fruit Box의 플레이 방식과 흐름을 멀티플레이에 맞게 옮긴 버전입니다. 방을 만들거나
          방 코드를 입력해 같은 배치에서 동시에 플레이할 수 있습니다.
        </p>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>새 방 만들기</h2>
          <p className={styles.panelText}>닉네임을 입력한 뒤 방을 만들면 바로 대기방으로 이동합니다.</p>
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
          <p className={styles.panelText}>공유받은 방 코드를 입력하면 같은 방에 입장합니다.</p>
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
    </div>
  );
}
