import { buildLeaderboard } from "../utils/leaderboard";
import type { RoomState } from "../types";
import styles from "./LeaderboardScreen.module.css";

interface LeaderboardScreenProps {
  room: RoomState;
  onLeaveRoom: () => void;
}

function formatClearTime(clearTimeMs: number | null): string {
  if (clearTimeMs === null) {
    return "-";
  }

  return `${(clearTimeMs / 1000).toFixed(1)}s`;
}

export function LeaderboardScreen({ room, onLeaveRoom }: LeaderboardScreenProps) {
  const leaderboard = buildLeaderboard(room);
  const singleRound = room.settings.roundCount === 1;

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>결과</h1>
          <p className={styles.description}>Room {room.code}</p>
        </div>
        <button className={styles.button} type="button" onClick={onLeaveRoom}>
          홈으로 나가기
        </button>
      </div>

      {singleRound ? (
        <ol className={styles.list}>
          {leaderboard.map((entry, index) => (
            <li key={entry.id} className={`${styles.listItem} ${index === 0 ? styles.winner : ""}`}>
              <span className={styles.rank}>{index + 1}.</span>
              <span className={styles.player}>
                {entry.nickname}
                {entry.isHost ? " (Host)" : ""}
              </span>
              <span className={styles.score}>{entry.finalScore}점</span>
              <span className={styles.time}>{formatClearTime(entry.clearTimes[0])}</span>
            </li>
          ))}
        </ol>
      ) : (
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
                    <td key={roundIndex}>
                      <div className={styles.roundCell}>
                        <strong>{score}</strong>
                        <span>{formatClearTime(entry.clearTimes[roundIndex])}</span>
                      </div>
                    </td>
                  ))}
                  <td>{entry.finalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
