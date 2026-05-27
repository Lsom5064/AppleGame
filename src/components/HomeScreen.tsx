import { useEffect, useState } from "react";
import type { RoomDirectoryState } from "../types";
import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  nickname: string;
  roomCode: string;
  joinPassword: string;
  createRoomName: string;
  createRoomPassword: string;
  createRoomIsPublic: boolean;
  roomDirectoryState: RoomDirectoryState;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onJoinPasswordChange: (value: string) => void;
  onCreateRoomNameChange: (value: string) => void;
  onCreateRoomPasswordChange: (value: string) => void;
  onCreateRoomIsPublicChange: (value: boolean) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinListedRoom: (roomCode: string, password: string) => void;
}

function getPhaseLabel(phase: RoomDirectoryState["rooms"][number]["phase"]): string {
  switch (phase) {
    case "lobby":
      return "대기중";
    case "playing":
      return "진행중";
    case "between-rounds":
      return "라운드 대기";
    case "finished":
      return "종료";
    default:
      return phase;
  }
}

export function HomeScreen({
  nickname,
  roomCode,
  joinPassword,
  createRoomName,
  createRoomPassword,
  createRoomIsPublic,
  roomDirectoryState,
  onNicknameChange,
  onRoomCodeChange,
  onJoinPasswordChange,
  onCreateRoomNameChange,
  onCreateRoomPasswordChange,
  onCreateRoomIsPublicChange,
  onCreateRoom,
  onJoinRoom,
  onJoinListedRoom
}: HomeScreenProps) {
  const [directoryPasswords, setDirectoryPasswords] = useState<Record<string, string>>({});
  const hasRooms = roomDirectoryState.status === "ready" && roomDirectoryState.rooms.length > 0;

  useEffect(() => {
    setDirectoryPasswords((currentPasswords) =>
      Object.fromEntries(
        roomDirectoryState.rooms
          .filter((room) => currentPasswords[room.roomCode] !== undefined)
          .map((room) => [room.roomCode, currentPasswords[room.roomCode]])
      )
    );
  }, [roomDirectoryState.rooms]);

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Fruit Box Multiplayer</h1>
        <p className={styles.description}>숫자 합이 10이 되도록 사과를 드래그하세요.</p>
        <p className={styles.note}>방장은 방 이름, 비밀번호, 공개 여부를 정할 수 있습니다.</p>
        <p className={styles.note}>메인 화면에서는 전체 방 목록을 보고 바로 입장할 수 있습니다.</p>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>새 방 만들기</h2>
          <p className={styles.panelText}>닉네임, 방 이름, 비밀번호, 공개 여부를 정한 뒤 방을 만듭니다.</p>
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
          <label className={styles.label}>
            방 이름
            <input
              className={styles.input}
              maxLength={30}
              placeholder="비우면 닉네임 기반으로 자동 생성"
              value={createRoomName}
              onChange={(event) => onCreateRoomNameChange(event.target.value)}
            />
          </label>
          <label className={styles.label}>
            비밀번호
            <input
              type="password"
              className={styles.input}
              maxLength={20}
              placeholder="없으면 비워두기"
              value={createRoomPassword}
              onChange={(event) => onCreateRoomPasswordChange(event.target.value)}
            />
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={createRoomIsPublic}
              onChange={(event) => onCreateRoomIsPublicChange(event.target.checked)}
            />
            <span>{createRoomIsPublic ? "공개 방으로 만들기" : "비공개 방으로 만들기"}</span>
          </label>
          <button className={styles.button} type="button" onClick={onCreateRoom}>
            방 만들기
          </button>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>방 코드로 참여하기</h2>
          <p className={styles.panelText}>목록 대신 방 코드를 직접 입력해 참가할 수도 있습니다.</p>
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
          <label className={styles.label}>
            비밀번호
            <input
              type="password"
              className={styles.input}
              maxLength={20}
              placeholder="필요한 경우 입력"
              value={joinPassword}
              onChange={(event) => onJoinPasswordChange(event.target.value)}
            />
          </label>
          <button className={styles.secondaryButton} type="button" onClick={onJoinRoom}>
            방 참여하기
          </button>
        </section>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>방 목록</h2>
        <p className={styles.panelText}>현재 입장 가능한 대기실만 방 이름과 방장 이름으로 표시됩니다.</p>

        {roomDirectoryState.status === "loading" ? (
          <p className={styles.directoryMessage}>방 목록을 불러오는 중입니다.</p>
        ) : null}

        {roomDirectoryState.status === "ready" && !hasRooms ? (
          <p className={styles.directoryMessage}>현재 열려 있는 방이 없습니다.</p>
        ) : null}

        {hasRooms ? (
          <div className={styles.roomList}>
            {roomDirectoryState.rooms.map((room) => {
              const isJoinable = room.phase === "lobby";
              const listPassword = directoryPasswords[room.roomCode] ?? "";

              return (
                <div key={room.roomCode} className={styles.roomCard}>
                  <div className={styles.roomCardHeader}>
                    <div>
                      <p className={styles.roomTitle}>{room.roomName}</p>
                      <p className={styles.roomMeta}>
                        방장 {room.hostNickname} · 코드 {room.roomCode} · {room.playerCount}명 · {room.roundCount}판 ·{" "}
                        {room.leaderboardMode === "sum" ? "합계" : "최고점"}
                      </p>
                    </div>
                    <span className={styles.roomPhase}>{getPhaseLabel(room.phase)}</span>
                  </div>

                  <div className={styles.roomBadges}>
                    <span className={styles.badge}>{room.isPublic ? "공개" : "비공개"}</span>
                    <span className={styles.badge}>{room.requiresPassword ? "비밀번호 있음" : "비밀번호 없음"}</span>
                  </div>

                  {room.requiresPassword ? (
                    <label className={styles.inlineLabel}>
                      비밀번호
                      <input
                        type="password"
                        className={styles.input}
                        maxLength={20}
                        placeholder="이 방의 비밀번호"
                        value={listPassword}
                        onChange={(event) =>
                          setDirectoryPasswords((currentPasswords) => ({
                            ...currentPasswords,
                            [room.roomCode]: event.target.value
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  <button
                    className={styles.roomButton}
                    type="button"
                    disabled={!isJoinable}
                    onClick={() => onJoinListedRoom(room.roomCode, listPassword)}
                  >
                    {isJoinable ? "이 방 입장하기" : "현재는 입장할 수 없음"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className={styles.rules}>
        <p>제한시간은 120초입니다.</p>
        <p>사과 1개당 1점입니다.</p>
        <p>방장은 로비에서 1판, 3판, 5판과 리더보드 기준을 정할 수 있습니다.</p>
        <p>진행 중이거나 종료됐거나 삭제된 방은 목록에서 자동으로 빠집니다.</p>
      </section>
    </div>
  );
}
