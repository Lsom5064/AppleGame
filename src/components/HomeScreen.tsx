import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  nickname: string;
  roomCode: string;
  providerName: string;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export function HomeScreen({
  nickname,
  roomCode,
  providerName,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom
}: HomeScreenProps) {
  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>Apple Sum 10 Multiplayer</span>
        <h1 className={styles.title}>합이 10이면 사라지는 멀티플레이 사과 게임</h1>
        <p className={styles.description}>
          같은 시드, 같은 라운드, 같은 배치에서 동시에 경쟁합니다. 방장이 라운드 수와 리더보드
          계산 방식을 정하면 참가자 전원이 동일한 판을 플레이합니다.
        </p>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>플레이어 정보</h2>
          <p className={styles.panelText}>닉네임을 입력한 뒤 새 방을 만들거나 기존 방에 입장하세요.</p>
          <label className={styles.label}>
            닉네임
            <input
              className={styles.input}
              maxLength={20}
              placeholder="예: AppleMaster"
              value={nickname}
              onChange={(event) => onNicknameChange(event.target.value)}
            />
          </label>
          <button className={styles.button} type="button" onClick={onCreateRoom}>
            방 만들기
          </button>
          <p className={styles.note}>실시간 백엔드: {providerName === "firebase" ? "Firebase" : "Local Mock"}</p>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>방 참여하기</h2>
          <p className={styles.panelText}>공유받은 방 코드를 입력하면 대기방으로 이동합니다.</p>
          <label className={styles.label}>
            방 코드
            <input
              className={styles.input}
              maxLength={6}
              placeholder="예: A1B2C3"
              value={roomCode}
              onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
            />
          </label>
          <button className={styles.secondaryButton} type="button" onClick={onJoinRoom}>
            방 참여하기
          </button>
          <p className={styles.note}>
            Firebase 환경변수가 없으면 로컬 폴백 모드로 실행됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}
