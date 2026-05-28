import { buildLeaderboard, buildTeamLeaderboard } from "../utils/leaderboard";
import { isPlayerConnected } from "../utils/presence";
import { getTeamName } from "../utils/teams";
import type { PlayerState, RoomState } from "../types";
import { RoomChat } from "./RoomChat";
import styles from "./LeaderboardScreen.module.css";

interface LeaderboardScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onSendChatMessage: (text: string) => Promise<void>;
  onRestartGame: () => Promise<void>;
}

function formatClearTime(clearTimeMs: number | null): string {
  if (clearTimeMs === null) {
    return "-";
  }

  return `${(clearTimeMs / 1000).toFixed(1)}s`;
}

function formatOptionalClearTime(clearTimeMs: number | null): string | null {
  if (clearTimeMs === null) {
    return null;
  }

  return `${(clearTimeMs / 1000).toFixed(1)}s`;
}

function getModeLabel(room: RoomState): string {
  const scoreLabel =
    room.settings.leaderboardMode === "best"
      ? `${room.settings.roundCount}판 중 최고점`
      : `${room.settings.roundCount}판 합계`;

  if (room.settings.gameMode === "solo") {
    return `개인전 / ${scoreLabel}`;
  }

  const teamLabel = room.settings.teamMode === "shared" ? "보드 공유 팀전" : "개인 보드 팀전";
  return `${teamLabel} / ${room.settings.teamCount}팀 / ${scoreLabel}`;
}

export function LeaderboardScreen({
  room,
  player,
  onLeaveRoom,
  onSendChatMessage,
  onRestartGame
}: LeaderboardScreenProps) {
  const leaderboard = buildLeaderboard(room);
  const teamLeaderboard = buildTeamLeaderboard(room);
  const singleRound = room.settings.roundCount === 1;
  const isTeamMode = room.settings.gameMode === "team";

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Room {room.code}</h1>
          <p className={styles.description}>결과 / {getModeLabel(room)}</p>
        </div>
        <div className={styles.actions}>
          {player.isHost ? (
            <button className={styles.primaryButton} type="button" onClick={() => void onRestartGame()}>
              재시작
            </button>
          ) : (
            <p className={styles.notice}>방장이 재시작하면 새 게임이 시작됩니다.</p>
          )}
          <button className={styles.button} type="button" onClick={onLeaveRoom}>
            홈으로 나가기
          </button>
        </div>
      </div>

      {isTeamMode ? (
        <section className={styles.teamSection}>
          <h2 className={styles.sectionTitle}>팀 순위</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>순위</th>
                  <th>팀</th>
                  {Array.from({ length: room.settings.roundCount }, (_, roundIndex) => (
                    <th key={roundIndex}>R{roundIndex + 1}</th>
                  ))}
                  <th>팀 점수</th>
                </tr>
              </thead>
              <tbody>
                {teamLeaderboard.map((entry, index) => (
                  <tr key={entry.id} className={index === 0 ? styles.winner : undefined}>
                    <td>{index + 1}</td>
                    <td>{entry.name}</td>
                    {entry.roundScores.map((roundScore, roundIndex) => (
                      <td key={roundIndex}>{roundScore}</td>
                    ))}
                    <td>{entry.finalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.teamCards}>
            {teamLeaderboard.map((team) => (
              <section key={team.id} className={styles.teamCard}>
                <h3 className={styles.teamTitle}>
                  {team.name} · {team.finalScore}점
                </h3>
                <ul className={styles.memberList}>
                  {team.members.map((member) => (
                    <li key={member.id} className={styles.memberRow}>
                      <span>
                        {member.nickname}
                        {member.isHost ? " (Host)" : ""}
                        {!isPlayerConnected(room.players[member.id]) ? " (오프라인)" : ""}
                      </span>
                      <span>{member.finalScore}점</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {singleRound && !isTeamMode ? (
        <ol className={styles.list}>
          {leaderboard.map((entry, index) => (
            <li key={entry.id} className={`${styles.listItem} ${index === 0 ? styles.winner : ""}`}>
              <span className={styles.rank}>{index + 1}.</span>
              <span className={styles.player}>
                {entry.nickname}
                {entry.isHost ? " (Host)" : ""}
                {!isPlayerConnected(room.players[entry.id]) ? " (오프라인)" : ""}
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
                {isTeamMode ? <th>팀</th> : null}
                {Array.from({ length: room.settings.roundCount }, (_, roundIndex) => (
                  <th key={roundIndex}>R{roundIndex + 1}</th>
                ))}
                <th>최종 점수</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => (
                <tr key={entry.id} className={index === 0 && !isTeamMode ? styles.winner : undefined}>
                  <td>{index + 1}</td>
                  <td>
                    {entry.nickname}
                    {entry.isHost ? " (Host)" : ""}
                    {!isPlayerConnected(room.players[entry.id]) ? " (오프라인)" : ""}
                  </td>
                  {isTeamMode ? <td>{getTeamName(room.teams, entry.teamId)}</td> : null}
                  {entry.roundScores.map((score, roundIndex) => {
                    const clearTimeLabel = formatOptionalClearTime(entry.clearTimes[roundIndex]);

                    return (
                      <td key={roundIndex}>
                        <div className={styles.roundCell}>
                          <strong>{score}</strong>
                          {clearTimeLabel ? <span>{clearTimeLabel}</span> : null}
                        </div>
                      </td>
                    );
                  })}
                  <td>{entry.finalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RoomChat
        player={player}
        messages={room.chatMessages}
        title="결과 화면 채팅"
        onSendMessage={onSendChatMessage}
      />
    </div>
  );
}
