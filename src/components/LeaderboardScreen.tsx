import { buildLeaderboard } from "../utils/leaderboard";
import type { RoomState } from "../types";
import styles from "./LeaderboardScreen.module.css";

interface LeaderboardScreenProps {
  room: RoomState;
  onLeaveRoom: () => void;
}

export function LeaderboardScreen({ room, onLeaveRoom }: LeaderboardScreenProps) {
  const leaderboard = buildLeaderboard(room);

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>최종 리더보드</h1>
          <p className={styles.description}>
            정렬 기준: {room.settings.leaderboardMode === "sum" ? "모든 라운드 합계" : "최고 점수 1개"}
          </p>
        </div>
        <button className={styles.button} type="button" onClick={onLeaveRoom}>
          홈으로 나가기
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>순위</th>
              <th>플레이어</th>
              {Array.from({ length: room.settings.roundCount }, (_, roundIndex) => (
                <th key={roundIndex}>R{roundIndex + 1}</th>
              ))}
              <th>최종 점수</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, index) => (
              <tr key={entry.id} className={index === 0 ? styles.winner : undefined}>
                <td>{index + 1}</td>
                <td>
                  {entry.nickname}
                  {entry.isHost ? " (Host)" : ""}
                </td>
                {entry.roundScores.map((score, roundIndex) => (
                  <td key={roundIndex}>{score}</td>
                ))}
                <td>{entry.finalScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
