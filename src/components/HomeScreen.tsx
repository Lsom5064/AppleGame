import type { NearbyRoomsState } from "../types";
import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  nickname: string;
  roomCode: string;
  nearbyRoomsState: NearbyRoomsState;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinNearbyRoom: (roomCode: string) => void;
}

export function HomeScreen({
  nickname,
  roomCode,
  nearbyRoomsState,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onJoinNearbyRoom
}: HomeScreenProps) {
  const hasNearbyRooms = nearbyRoomsState.status === "ready" && nearbyRoomsState.rooms.length > 0;

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Fruit Box Multiplayer</h1>
        <p className={styles.description}>숫자 합이 10이 되도록 사과를 드래그하세요.</p>
        <p className={styles.note}>방을 만들거나 방 코드로 입장해 같은 배치에서 동시에 플레이합니다.</p>
        <p className={styles.note}>같은 공유기 방은 우선적으로, 그 외 공개된 대기실은 보조적으로 자동 표시됩니다.</p>
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

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>근처 방</h2>
        <p className={styles.panelText}>같은 공유기 대기실을 우선 찾고, 필요하면 공개 대기실도 함께 표시합니다.</p>

        {nearbyRoomsState.status === "loading" ? (
          <p className={styles.nearbyMessage}>근처 방을 확인하는 중입니다.</p>
        ) : null}

        {nearbyRoomsState.status === "ready" && !hasNearbyRooms ? (
          <p className={styles.nearbyMessage}>지금 발견된 자동 공유 방이 없습니다.</p>
        ) : null}

        {hasNearbyRooms ? (
          <div className={styles.nearbyList}>
            {nearbyRoomsState.rooms.map((room) => (
              <button
                key={room.roomCode}
                className={styles.nearbyRoom}
                type="button"
                onClick={() => onJoinNearbyRoom(room.roomCode)}
              >
                <span className={styles.nearbyRoomTitle}>{room.hostNickname}님의 방</span>
                <span className={styles.nearbyRoomMeta}>
                  코드 {room.roomCode} · {room.playerCount}명 · {room.roundCount}판 ·{" "}
                  {room.leaderboardMode === "sum" ? "합계" : "최고점"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.rules}>
        <p>제한시간은 120초입니다.</p>
        <p>사과 1개당 1점입니다.</p>
        <p>방장은 로비에서 1판, 3판, 5판과 리더보드 기준을 정할 수 있습니다.</p>
        <p>모든 참가자는 같은 배치에서 동시에 플레이합니다.</p>
      </section>
    </div>
  );
}
