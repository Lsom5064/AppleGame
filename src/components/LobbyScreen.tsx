import type { GameSettings, PlayerState, RoomState } from "../types";
import { countConnectedPlayers, isPlayerConnected } from "../utils/presence";
import { getTeamName } from "../utils/teams";
import { RoomChat } from "./RoomChat";
import styles from "./LobbyScreen.module.css";

interface LobbyScreenProps {
  room: RoomState;
  player: PlayerState;
  onLeaveRoom: () => void;
  onSendChatMessage: (text: string) => Promise<void>;
  onUpdateSettings: (
    settings: Partial<
      Pick<GameSettings, "roundCount" | "leaderboardMode" | "gameMode" | "teamMode" | "teamCount">
    >
  ) => void;
  onRandomizeTeams: () => void;
  onAssignPlayerTeam: (targetPlayerId: string, teamId: string) => void;
  onStartGame: () => void;
}

function getLeaderboardModeLabel(mode: GameSettings["leaderboardMode"]): string {
  return mode === "best" ? "N판 중 최고점" : "N판 점수 합계";
}

function getGameModeLabel(room: RoomState): string {
  if (room.settings.gameMode === "solo") {
    return "개인전";
  }

  return room.settings.teamMode === "shared" ? `${room.settings.teamCount}팀 단일 화면` : `${room.settings.teamCount}팀 개별 화면`;
}

export function LobbyScreen({
  room,
  player,
  onLeaveRoom,
  onSendChatMessage,
  onUpdateSettings,
  onRandomizeTeams,
  onAssignPlayerTeam,
  onStartGame
}: LobbyScreenProps) {
  const isHost = room.hostId === player.id;
  const players = Object.values(room.players);
  const isTeamMode = room.settings.gameMode === "team";
  const connectedCount = countConnectedPlayers(room);

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Lobby</p>
          <h1 className={styles.title}>{room.name}</h1>
          <p className={styles.description}>
            Room {room.code} · 참가자 {players.length}명 · 현재 접속 {connectedCount}명
          </p>
          <div className={styles.summaryRow}>
            <span className={styles.summaryChip}>{getGameModeLabel(room)}</span>
            <span className={styles.summaryChip}>{room.settings.roundCount}판</span>
            <span className={styles.summaryChip}>{getLeaderboardModeLabel(room.settings.leaderboardMode)}</span>
          </div>
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

      <div className={styles.contentArea}>
        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>참가자</h2>
            <ul className={styles.list}>
              {players.map((member) => (
                <li key={member.id} className={styles.playerRow}>
                  <div className={styles.playerMeta}>
                    <span>{member.nickname}</span>
                    {member.isHost ? <span className={styles.badge}>방장</span> : null}
                    {!isPlayerConnected(member) ? <span className={styles.offlineBadge}>오프라인</span> : null}
                  </div>

                  {isTeamMode ? (
                    isHost ? (
                      <label className={styles.teamSelectWrap}>
                        <span className={styles.teamLabel}>팀</span>
                        <select
                          className={styles.teamSelect}
                          value={member.teamId ?? room.teams[0]?.id ?? ""}
                          onChange={(event) => onAssignPlayerTeam(member.id, event.target.value)}
                        >
                          {room.teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className={styles.teamBadge}>{getTeamName(room.teams, member.teamId)}</span>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
          <h2 className={styles.panelTitle}>게임 모드</h2>
          <div className={styles.settings}>
            <div className={styles.settingBlock}>
              <p className={styles.settingLabel}>대전 방식</p>
              <div className={styles.optionColumn}>
                <label className={styles.option}>
                  <input
                    checked={room.settings.gameMode === "solo"}
                    disabled={!isHost}
                    name="gameMode"
                    type="radio"
                    onChange={() => onUpdateSettings({ gameMode: "solo" })}
                  />
                  <span>개인전</span>
                </label>
                <label className={styles.option}>
                  <input
                    checked={room.settings.gameMode === "team"}
                    disabled={!isHost}
                    name="gameMode"
                    type="radio"
                    onChange={() => onUpdateSettings({ gameMode: "team" })}
                  />
                  <span>팀전</span>
                </label>
              </div>
            </div>

            <div className={styles.settingBlock}>
              <p className={styles.settingLabel}>판 수</p>
              <div className={styles.optionRow}>
                {[1, 3, 5].map((roundCount) => (
                  <label key={roundCount} className={styles.option}>
                    <input
                      checked={room.settings.roundCount === roundCount}
                      disabled={!isHost}
                      name="roundCount"
                      type="radio"
                      onChange={() =>
                        onUpdateSettings({
                          roundCount: roundCount as GameSettings["roundCount"]
                        })
                      }
                    />
                    <span>{roundCount}판</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.settingBlock}>
              <p className={styles.settingLabel}>리더보드 기준</p>
              <div className={styles.optionColumn}>
                <label className={styles.option}>
                  <input
                    checked={room.settings.leaderboardMode === "sum"}
                    disabled={!isHost}
                    name="leaderboardMode"
                    type="radio"
                    onChange={() => onUpdateSettings({ leaderboardMode: "sum" })}
                  />
                  <span>N판 점수 합계</span>
                </label>
                <label className={styles.option}>
                  <input
                    checked={room.settings.leaderboardMode === "best"}
                    disabled={!isHost}
                    name="leaderboardMode"
                    type="radio"
                    onChange={() => onUpdateSettings({ leaderboardMode: "best" })}
                  />
                  <span>N판 중 최고점</span>
                </label>
              </div>
            </div>

            {isTeamMode ? (
              <>
                <div className={styles.settingBlock}>
                  <p className={styles.settingLabel}>팀전 진행 방식</p>
                  <div className={styles.optionColumn}>
                    <label className={styles.option}>
                      <input
                        checked={room.settings.teamMode === "individual"}
                        disabled={!isHost}
                        name="teamMode"
                        type="radio"
                        onChange={() => onUpdateSettings({ teamMode: "individual" })}
                      />
                      <span>개별 화면</span>
                    </label>
                    <label className={styles.option}>
                      <input
                        checked={room.settings.teamMode === "shared"}
                        disabled={!isHost}
                        name="teamMode"
                        type="radio"
                        onChange={() => onUpdateSettings({ teamMode: "shared" })}
                      />
                      <span>단일 화면</span>
                    </label>
                  </div>
                </div>

                <div className={styles.settingBlock}>
                  <p className={styles.settingLabel}>팀 수</p>
                  <div className={styles.optionRow}>
                    {[2, 3, 4, 5, 6].map((teamCount) => (
                      <label key={teamCount} className={styles.option}>
                        <input
                          checked={room.settings.teamCount === teamCount}
                          disabled={!isHost}
                          name="teamCount"
                          type="radio"
                          onChange={() => onUpdateSettings({ teamCount })}
                        />
                        <span>{teamCount}팀</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.settingBlock}>
                  <p className={styles.settingLabel}>팀 배정</p>
                  <div className={styles.teamActionRow}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={!isHost}
                      onClick={onRandomizeTeams}
                    >
                      랜덤으로 팀 나누기
                    </button>
                    <p className={styles.hint}>
                      팀전에서는 모든 참가자가 항상 팀에 배정됩니다. 방장은 참가자 목록에서 팀만 바꿀 수 있습니다.
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            <p className={styles.rule}>
              현재 설정: {getGameModeLabel(room)} / {room.settings.roundCount}판 /{" "}
              {getLeaderboardModeLabel(room.settings.leaderboardMode)}
            </p>
            {isTeamMode && room.settings.teamMode === "shared" ? (
              <p className={styles.hint}>같은 팀은 하나의 공용 보드와 점수를 공유합니다.</p>
            ) : null}
          </div>

          <h2 className={styles.panelTitle}>게임 규칙</h2>
          <div className={styles.settings}>
            <p className={styles.rule}>제한시간은 120초입니다.</p>
            <p className={styles.rule}>드래그한 범위의 숫자 합이 10이면 사과가 제거됩니다.</p>
            <p className={styles.rule}>사과 1개당 1점이며, 모두 제거하면 클리어 시간이 기록됩니다.</p>
            <p className={styles.hint}>
              {isHost ? "방장이 모드를 정하고 시작합니다." : "방장이 모드를 정할 때까지 대기합니다."}
            </p>
          </div>
          </section>
        </div>

        <div className={styles.chatWrap}>
          <RoomChat
            player={player}
            messages={room.chatMessages}
            title="대기실 채팅"
            onSendMessage={onSendChatMessage}
          />
        </div>
      </div>
    </div>
  );
}
