import { describe, expect, it } from "vitest";
import type { RoomState } from "../types";
import {
  addRoomChatMessage,
  applySharedTeamBoardSelection,
  applySharedTeamSelection,
  assignRoomPlayerTeam,
  clearTeamPointer,
  createInitialRoom,
  forceRoomProgress,
  joinRoom,
  leaveRoom,
  normalizeRoomState,
  randomizeRoomTeams,
  startRoomGame,
  submitRoundScore,
  updatePlayerPresence,
  updateTeamPointer,
  updateRoomSettings,
  voteForNextRound
} from "../utils/roomMutations";
import { generateApples } from "../utils/gameBoard";

function createStartedRoom(): RoomState {
  const created = createInitialRoom("ROOM12", "host", "Host", 1000);
  const joined = joinRoom(created, "guest", "Guest", 1500);
  const configured = updateRoomSettings(joined, "host", {
    roundCount: 3
  });
  return startRoomGame(configured, "host", 2000);
}

function createSharedModeRoom(roundCount: 1 | 3 | 5 = 1): RoomState {
  const created = createInitialRoom("ROOM12", "host", "Host", 1000);
  const withGuest = joinRoom(created, "guest", "Guest", 1500);
  const withThird = joinRoom(withGuest, "third", "Third", 1700);
  const withFourth = joinRoom(withThird, "fourth", "Fourth", 1900);
  const configured = updateRoomSettings(withFourth, "host", {
    roundCount,
    gameMode: "team",
    teamMode: "shared",
    teamCount: 2
  });
  const teamSetup = assignRoomPlayerTeam(
    assignRoomPlayerTeam(
      assignRoomPlayerTeam(
        assignRoomPlayerTeam(configured, "host", "host", "team-1"),
        "host",
        "guest",
        "team-1"
      ),
      "host",
      "third",
      "team-2"
    ),
    "host",
    "fourth",
    "team-2"
  );

  return startRoomGame(teamSetup, "host", 2000);
}

describe("roomMutations", () => {
  it("stores the room access options when a host creates a room", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000, {
      name: "  사과방  ",
      password: " 1234 ",
      isPublic: false
    });

    expect(room.name).toBe("사과방");
    expect(room.access).toEqual({
      password: "1234",
      isPublic: false
    });
  });

  it("allows only the host to change lobby settings", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000);

    expect(
      updateRoomSettings(room, "host", {
        roundCount: 5,
        leaderboardMode: "best"
      }).settings
    ).toMatchObject({
      roundCount: 5,
      leaderboardMode: "best"
    });

    expect(() =>
      updateRoomSettings(room, "guest", {
        roundCount: 1
      })
    ).toThrow("방장만 설정을 변경할 수 있습니다.");
  });

  it("stores and normalizes team mode settings in the lobby", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000);
    const updated = updateRoomSettings(room, "host", {
      gameMode: "team",
      teamMode: "individual",
      teamCount: 4
    });

    expect(updated.settings.gameMode).toBe("team");
    expect(updated.settings.teamMode).toBe("individual");
    expect(updated.settings.teamCount).toBe(4);
    expect(updated.teams.map((team) => team.name)).toEqual(["1팀", "2팀", "3팀", "4팀"]);
    expect(updated.players.host.teamId).toBe("team-1");
  });

  it("clamps team count changes and reassigns players to valid teams after shrinking teams", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const expanded = updateRoomSettings(withGuest, "host", {
      gameMode: "team",
      teamCount: 8
    });
    const assigned = assignRoomPlayerTeam(expanded, "host", "guest", "team-6");
    const shrunk = updateRoomSettings(assigned, "host", {
      teamCount: 2
    });

    expect(expanded.settings.teamCount).toBe(6);
    expect(expanded.teams).toHaveLength(6);
    expect(shrunk.settings.teamCount).toBe(2);
    expect(shrunk.teams).toHaveLength(2);
    expect(shrunk.players.guest.teamId).toBe("team-1");
  });

  it("lets the host effectively assign team-1 from the lobby state", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const teamRoom = updateRoomSettings(withGuest, "host", {
      gameMode: "team",
      teamCount: 2
    });
    const assigned = assignRoomPlayerTeam(teamRoom, "host", "guest", "team-1");

    expect(assigned.players.host.teamId).toBe("team-1");
    expect(assigned.players.guest.teamId).toBe("team-1");
  });

  it("assigns newly joined players to team-1 immediately in team mode", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const teamRoom = updateRoomSettings(created, "host", {
      gameMode: "team",
      teamMode: "individual",
      teamCount: 2
    });
    const joined = joinRoom(teamRoom, "guest", "Guest", 1500);

    expect(joined.players.guest.teamId).toBe("team-1");
  });

  it("requires the correct password when joining a locked room", () => {
    const room = createInitialRoom("ROOM12", "host", "Host", 1000, {
      name: "잠금방",
      password: "apple",
      isPublic: true
    });

    expect(() => joinRoom(room, "guest", "Guest", 1500, "wrong")).toThrow("비밀번호가 올바르지 않습니다.");
    expect(joinRoom(room, "guest", "Guest", 1500, "apple").players.guest.nickname).toBe("Guest");
  });

  it("allows an existing player to reconnect without resetting progress", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", { roundCount: 1 });
    const started = startRoomGame(configured, "host", 2000);
    const withHostScore = submitRoundScore(started, "host", 0, 8, null, 2100);
    const rejoined = joinRoom(withHostScore, "host", "Host Reloaded", 4000);

    expect(rejoined.players.host.nickname).toBe("Host Reloaded");
    expect(rejoined.players.host.isHost).toBe(true);
    expect(rejoined.players.host.connected).toBe(true);
    expect(rejoined.players.host.roundScores["0"]).toBe(8);
    expect(rejoined.phase).toBe("playing");
  });

  it("preserves shared-team board progress when an existing player reconnects", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const sharedRoom = updateRoomSettings(joined, "host", {
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    });
    const assignedGuest = assignRoomPlayerTeam(sharedRoom, "host", "guest", "team-1");
    const assigned = assignRoomPlayerTeam(assignedGuest, "host", "host", "team-1");
    const started = startRoomGame(assigned, "host", 2000);
    const apples = generateApples(`${started.seed}:0`);
    const selected = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const progressed = applySharedTeamSelection(
      started,
      "host",
      0,
      selected.map((apple) => apple.id),
      null,
      2300
    );
    const pointed = updateTeamPointer(progressed, "guest", 0, 120, 160, true, 2400, true, 90, 110);
    const rejoined = joinRoom(pointed, "guest", "Guest Reloaded", 2600);

    expect(rejoined.players.guest.nickname).toBe("Guest Reloaded");
    expect(rejoined.players.guest.teamId).toBe("team-1");
    expect(rejoined.players.guest.connected).toBe(true);
    expect(rejoined.sharedTeamBoards["0"]["team-1"].score).toBe(3);
    expect(rejoined.sharedTeamBoards["0"]["team-1"].removedAppleIds).toHaveLength(3);
    expect(pointed.teamPointers.guest).toMatchObject({
      dragging: true,
      selectionStartX: 90,
      selectionStartY: 110
    });
    expect(rejoined.teamPointers.guest).toBeUndefined();
  });

  it("updates presence and removes team pointers when a player goes offline", () => {
    const started = createSharedModeRoom();
    const pointed = updateTeamPointer(started, "guest", 0, 150, 150, true, 2100, false, 150, 150);
    const offline = updatePlayerPresence(pointed, "guest", false, 2200);
    const online = updatePlayerPresence(offline, "guest", true, 2300);

    expect(offline.players.guest.connected).toBe(false);
    expect(offline.players.guest.lastSeenAt).toBe(2200);
    expect(offline.teamPointers.guest).toBeUndefined();
    expect(online.players.guest.connected).toBe(true);
    expect(online.players.guest.lastSeenAt).toBe(2300);
  });

  it("randomly assigns players across the configured teams", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const withThird = joinRoom(withGuest, "third", "Third", 1700);
    const teamRoom = updateRoomSettings(withThird, "host", {
      gameMode: "team",
      teamCount: 2
    });
    const randomized = randomizeRoomTeams(teamRoom, "host", 2000);
    const assignedTeams = Object.values(randomized.players).map((member) => member.teamId);

    expect(assignedTeams.every((teamId) => teamId === "team-1" || teamId === "team-2")).toBe(true);
    expect(new Set(assignedTeams).size).toBe(2);
  });

  it("lets the host manually assign a player to a team", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const teamRoom = updateRoomSettings(joined, "host", {
      gameMode: "team",
      teamCount: 3
    });
    const assigned = assignRoomPlayerTeam(teamRoom, "host", "guest", "team-3");

    expect(assigned.players.guest.teamId).toBe("team-3");
  });

  it("rejects manual assignment to an empty team id", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const teamRoom = updateRoomSettings(joined, "host", {
      gameMode: "team",
      teamCount: 3
    });

    expect(() => assignRoomPlayerTeam(teamRoom, "host", "guest", "" as never)).toThrow("유효하지 않은 팀입니다.");
  });

  it("auto-fills missing team assignments before starting an individual team game", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const withThird = joinRoom(withGuest, "third", "Third", 1700);
    const teamRoom = updateRoomSettings(withThird, "host", {
      gameMode: "team",
      teamMode: "individual",
      teamCount: 2
    });
    const started = startRoomGame(teamRoom, "host", 2000);

    expect(Object.values(started.players).every((member) => member.teamId !== null)).toBe(true);
  });

  it("keeps explicit manual assignments when the host starts immediately after editing teams", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const withThird = joinRoom(withGuest, "third", "Third", 1700);
    const configured = updateRoomSettings(withThird, "host", {
      gameMode: "team",
      teamMode: "individual",
      teamCount: 2
    });
    const movedGuest = assignRoomPlayerTeam(configured, "host", "guest", "team-2");
    const movedThird = assignRoomPlayerTeam(movedGuest, "host", "third", "team-2");
    const started = startRoomGame(movedThird, "host", 2000);

    expect(started.players.guest.teamId).toBe("team-2");
    expect(started.players.third.teamId).toBe("team-2");
    expect(started.players.host.teamId).toBe("team-1");
  });

  it("starts a shared-screen team game with per-team board state", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const sharedTeamRoom = updateRoomSettings(joined, "host", {
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    });
    const assigned = assignRoomPlayerTeam(
      assignRoomPlayerTeam(sharedTeamRoom, "host", "host", "team-1"),
      "host",
      "guest",
      "team-2"
    );
    const started = startRoomGame(assigned, "host", 2000);

    expect(started.phase).toBe("playing");
    expect(started.sharedTeamBoards["0"]["team-1"]?.score).toBe(0);
    expect(started.sharedTeamBoards["0"]["team-2"]?.score).toBe(0);
  });

  it("applies a shared-team selection only once even if submitted twice", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const sharedTeamRoom = updateRoomSettings(withGuest, "host", {
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    });
    const assignedHost = assignRoomPlayerTeam(sharedTeamRoom, "host", "host", "team-1");
    const assigned = assignRoomPlayerTeam(assignedHost, "host", "guest", "team-1");
    const started = startRoomGame(assigned, "host", 2000);
    const apples = generateApples(`${started.seed}:0`);
    const oneApple = apples.find((apple) => apple.value === 1);
    const twoApple = apples.find((apple) => apple.value === 2);
    const sevenApple = apples.find((apple) => apple.value === 7);

    expect(oneApple && twoApple && sevenApple).toBeTruthy();

    const selected = [oneApple!, twoApple!, sevenApple!];

    const afterFirst = applySharedTeamSelection(
      started,
      "host",
      0,
      selected.map((apple) => apple.id),
      null,
      2300
    );
    const afterSecond = applySharedTeamSelection(
      afterFirst,
      "guest",
      0,
      selected.map((apple) => apple.id),
      null,
      2350
    );

    expect(afterFirst.sharedTeamBoards["0"]["team-1"].score).toBe(3);
    expect(afterSecond.sharedTeamBoards["0"]["team-1"].score).toBe(3);
    expect(afterSecond.sharedTeamBoards["0"]["team-1"].removedAppleIds).toHaveLength(3);
  });

  it("applies shared-team board selections at team-board scope", () => {
    const started = createSharedModeRoom();
    const apples = generateApples(`${started.seed}:0`);
    const selected = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const board = started.sharedTeamBoards["0"]["team-1"];
    const nextBoard = applySharedTeamBoardSelection(
      started,
      "team-1",
      0,
      board,
      selected.map((apple) => apple.id),
      null
    );
    const duplicateBoard = applySharedTeamBoardSelection(
      started,
      "team-1",
      0,
      nextBoard,
      selected.map((apple) => apple.id),
      null
    );

    expect(nextBoard.score).toBe(3);
    expect(nextBoard.removedAppleIds).toHaveLength(3);
    expect(duplicateBoard).toEqual(nextBoard);
  });

  it("keeps shared-team progress isolated per team when two teams remove apples in the same round", () => {
    const started = createSharedModeRoom();
    const apples = generateApples(`${started.seed}:0`);
    const teamOneSelection = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const remainingApples = apples.filter(
      (apple) => !teamOneSelection.some((selectedApple) => selectedApple.id === apple.id)
    );
    const teamTwoSelection = [
      remainingApples.find((apple) => apple.value === 1)!,
      remainingApples.find((apple) => apple.value === 3)!,
      remainingApples.find((apple) => apple.value === 6)!
    ];
    const afterTeamOne = applySharedTeamSelection(
      started,
      "host",
      0,
      teamOneSelection.map((apple) => apple.id),
      null,
      2300
    );
    const afterTeamTwo = applySharedTeamSelection(
      afterTeamOne,
      "third",
      0,
      teamTwoSelection.map((apple) => apple.id),
      null,
      2320
    );

    expect(afterTeamTwo.sharedTeamBoards["0"]["team-1"].score).toBe(3);
    expect(afterTeamTwo.sharedTeamBoards["0"]["team-2"].score).toBe(3);
    expect(afterTeamTwo.sharedTeamBoards["0"]["team-1"].removedAppleIds).toHaveLength(3);
    expect(afterTeamTwo.sharedTeamBoards["0"]["team-2"].removedAppleIds).toHaveLength(3);
  });

  it("keeps shared mode consistent through concurrent clicks, reconnect, chat, and timeout", () => {
    const started = createSharedModeRoom();
    const apples = generateApples(`${started.seed}:0`);
    const teamOneSelection = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const remainingApples = apples.filter(
      (apple) => !teamOneSelection.some((selectedApple) => selectedApple.id === apple.id)
    );
    const teamTwoSelection = [
      remainingApples.find((apple) => apple.value === 1)!,
      remainingApples.find((apple) => apple.value === 3)!,
      remainingApples.find((apple) => apple.value === 6)!
    ];

    const withPointerA = updateTeamPointer(started, "host", 0, 140, 120, true, 2100);
    const withPointerB = updateTeamPointer(withPointerA, "guest", 0, 148, 124, true, 2101);
    const withPointerC = updateTeamPointer(withPointerB, "third", 0, 320, 120, true, 2102);
    const withPointerD = updateTeamPointer(withPointerC, "fourth", 0, 328, 124, true, 2103);
    const afterHostSelection = applySharedTeamSelection(
      withPointerD,
      "host",
      0,
      teamOneSelection.map((apple) => apple.id),
      null,
      2300
    );
    const afterGuestDuplicate = applySharedTeamSelection(
      afterHostSelection,
      "guest",
      0,
      teamOneSelection.map((apple) => apple.id),
      null,
      2301
    );
    const afterThirdSelection = applySharedTeamSelection(
      afterGuestDuplicate,
      "third",
      0,
      teamTwoSelection.map((apple) => apple.id),
      null,
      2302
    );
    const afterFourthDuplicate = applySharedTeamSelection(
      afterThirdSelection,
      "fourth",
      0,
      teamTwoSelection.map((apple) => apple.id),
      null,
      2303
    );
    const afterReconnect = joinRoom(afterFourthDuplicate, "guest", "Guest Reloaded", 2400);
    const afterChat = addRoomChatMessage(afterReconnect, "host", "다음 라운드 준비", 2450);
    const resolved = forceRoomProgress(
      afterChat,
      2000 + started.settings.roundDurationSec * 1000 + 2000
    );

    expect(resolved.phase).toBe("finished");
    expect(resolved.players.guest.nickname).toBe("Guest Reloaded");
    expect(resolved.sharedTeamBoards["0"]["team-1"].score).toBe(3);
    expect(resolved.sharedTeamBoards["0"]["team-2"].score).toBe(3);
    expect(resolved.sharedTeamBoards["0"]["team-1"].removedAppleIds).toHaveLength(3);
    expect(resolved.sharedTeamBoards["0"]["team-2"].removedAppleIds).toHaveLength(3);
    expect(resolved.submissions["0"].host.score).toBe(3);
    expect(resolved.submissions["0"].guest.score).toBe(3);
    expect(resolved.submissions["0"].third.score).toBe(3);
    expect(resolved.submissions["0"].fourth.score).toBe(3);
    expect(resolved.teamPointers).toEqual({});
    expect(resolved.chatMessages[resolved.chatMessages.length - 1]?.text).toBe("다음 라운드 준비");
  });

  it("stores and clears shared-team pointers", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const sharedTeamRoom = updateRoomSettings(withGuest, "host", {
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    });
    const assigned = assignRoomPlayerTeam(sharedTeamRoom, "host", "host", "team-1");
    const started = startRoomGame(assigned, "host", 2000);
    const pointed = updateTeamPointer(started, "host", 0, 120, 140, true, 2100);
    const cleared = clearTeamPointer(pointed, "host");

    expect(pointed.teamPointers.host).toMatchObject({
      playerId: "host",
      teamId: "team-1",
      x: 120,
      y: 140,
      active: true
    });
    expect(cleared.teamPointers.host).toBeUndefined();
  });

  it("submits shared-team scores to every member when the round times out", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const withThird = joinRoom(withGuest, "third", "Third", 1700);
    const configured = updateRoomSettings(withThird, "host", {
      roundCount: 1,
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    });
    const teamA = assignRoomPlayerTeam(configured, "host", "host", "team-1");
    const teamAWithGuest = assignRoomPlayerTeam(teamA, "host", "guest", "team-1");
    const assigned = assignRoomPlayerTeam(teamAWithGuest, "host", "third", "team-2");
    const started = startRoomGame(assigned, "host", 2000);
    const apples = generateApples(`${started.seed}:0`);
    const selected = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const progressed = applySharedTeamSelection(
      started,
      "host",
      0,
      selected.map((apple) => apple.id),
      null,
      2300
    );
    const resolved = forceRoomProgress(progressed, 2000 + started.settings.roundDurationSec * 1000 + 2000);

    expect(resolved.phase).toBe("finished");
    expect(resolved.players.host.roundScores["0"]).toBe(3);
    expect(resolved.players.guest.roundScores["0"]).toBe(3);
    expect(resolved.players.third.roundScores["0"]).toBe(0);
    expect(resolved.submissions["0"].host.score).toBe(3);
    expect(resolved.submissions["0"].guest.score).toBe(3);
    expect(resolved.submissions["0"].third.score).toBe(0);
  });

  it("allows the maximum supported team count and preserves one-player-per-team assignments", () => {
    let room = createInitialRoom("ROOM12", "host", "Host", 1000);
    const playerIds = ["guest1", "guest2", "guest3", "guest4", "guest5"];

    playerIds.forEach((playerId, index) => {
      room = joinRoom(room, playerId, `Guest${index + 1}`, 1500 + index * 100);
    });

    room = updateRoomSettings(room, "host", {
      gameMode: "team",
      teamMode: "individual",
      teamCount: 6
    });

    ["host", ...playerIds].forEach((playerId, index) => {
      room = assignRoomPlayerTeam(room, "host", playerId, `team-${index + 1}`);
    });

    const started = startRoomGame(room, "host", 2400);
    const assignedTeams = Object.values(started.players).map((member) => member.teamId);

    expect(new Set(assignedTeams).size).toBe(6);
    expect(started.teams).toHaveLength(6);
  });

  it("re-initializes shared team boards and clears pointers when unanimous voting starts the next round", () => {
    const started = createSharedModeRoom(3);
    const apples = generateApples(`${started.seed}:0`);
    const teamOneSelection = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const progressed = applySharedTeamSelection(
      updateTeamPointer(started, "host", 0, 120, 120, true, 2100),
      "host",
      0,
      teamOneSelection.map((apple) => apple.id),
      null,
      2300
    );
    const waiting = forceRoomProgress(
      progressed,
      2000 + started.settings.roundDurationSec * 1000 + 2000
    );
    const hostVoted = voteForNextRound(waiting, "host", 125000);
    const guestVoted = voteForNextRound(hostVoted, "guest", 125010);
    const thirdVoted = voteForNextRound(guestVoted, "third", 125020);
    const nextRound = voteForNextRound(thirdVoted, "fourth", 125030);

    expect(nextRound.phase).toBe("playing");
    expect(nextRound.currentRoundIndex).toBe(1);
    expect(nextRound.teamPointers).toEqual({});
    expect(nextRound.sharedTeamBoards["1"]["team-1"]).toMatchObject({
      score: 0,
      removedAppleIds: [],
      submittedAt: null
    });
    expect(nextRound.sharedTeamBoards["1"]["team-2"]).toMatchObject({
      score: 0,
      removedAppleIds: [],
      submittedAt: null
    });
  });

  it("advances a shared-mode next round based on connected players only", () => {
    const started = createSharedModeRoom(3);
    const apples = generateApples(`${started.seed}:0`);
    const selection = [
      apples.find((apple) => apple.value === 1)!,
      apples.find((apple) => apple.value === 2)!,
      apples.find((apple) => apple.value === 7)!
    ];
    const progressed = applySharedTeamSelection(
      started,
      "host",
      0,
      selection.map((apple) => apple.id),
      null,
      2300
    );
    const waiting = forceRoomProgress(
      progressed,
      2000 + started.settings.roundDurationSec * 1000 + 2000
    );
    const withOfflineThird = updatePlayerPresence(waiting, "third", false, 124000);
    const withOfflineFourth = updatePlayerPresence(withOfflineThird, "fourth", false, 124100);
    const hostVoted = voteForNextRound(withOfflineFourth, "host", 125000);
    const nextRound = voteForNextRound(hostVoted, "guest", 125010);

    expect(nextRound.phase).toBe("playing");
    expect(nextRound.currentRoundIndex).toBe(1);
    expect(nextRound.nextRoundVotes).toEqual({});
  });

  it("adds chat messages for players in the room", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const withMessage = addRoomChatMessage(joined, "guest", "  안녕하세요  ", 2000);

    expect(withMessage.chatMessages).toEqual([
      {
        id: "guest:2000:0",
        playerId: "guest",
        nickname: "Guest",
        text: "안녕하세요",
        createdAt: 2000
      }
    ]);
  });

  it("waits for the host to start the next round after every player submits", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const afterGuest = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);

    expect(afterGuest.phase).toBe("between-rounds");
    expect(afterGuest.currentRoundIndex).toBe(0);
    expect(afterGuest.players.host.roundScores["0"]).toBe(6);
    expect(afterGuest.players.guest.roundScores["0"]).toBe(4);
    expect(afterGuest.roundStartedAt).toBeNull();
    expect(afterGuest.submissions["0"].host.clearTimeMs).toBe(11000);
    expect(afterGuest.nextRoundVotes).toEqual({});
  });

  it("starts the next round only when every player votes for it", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const waiting = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);
    const afterHostVote = voteForNextRound(waiting, "host", 4500);

    expect(afterHostVote.phase).toBe("between-rounds");
    expect(afterHostVote.nextRoundVotes).toEqual({ host: true });

    const nextRound = voteForNextRound(afterHostVote, "guest", 5000);

    expect(nextRound.phase).toBe("playing");
    expect(nextRound.currentRoundIndex).toBe(1);
    expect(nextRound.roundStartedAt).toBe(5000);
    expect(nextRound.nextRoundVotes).toEqual({});
  });

  it("starts the next round when all currently connected players vote", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const waiting = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);
    const withOfflineGuest = updatePlayerPresence(waiting, "guest", false, 4000);
    const nextRound = voteForNextRound(withOfflineGuest, "host", 4500);

    expect(nextRound.phase).toBe("playing");
    expect(nextRound.currentRoundIndex).toBe(1);
    expect(nextRound.nextRoundVotes).toEqual({});
  });

  it("treats players with stale heartbeats as disconnected for next-round voting", () => {
    const started = createStartedRoom();
    const afterHost = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const waiting = submitRoundScore(afterHost, "guest", 0, 4, null, 3500);
    const staleGuestRoom: RoomState = {
      ...waiting,
      players: {
        ...waiting.players,
        guest: {
          ...waiting.players.guest,
          connected: true,
          lastSeenAt: 0
        }
      }
    };
    const nextRound = voteForNextRound(staleGuestRoom, "host", 45000);

    expect(nextRound.phase).toBe("playing");
    expect(nextRound.currentRoundIndex).toBe(1);
  });

  it("completes a 3-round game in the expected pause and resume order", () => {
    const started = createStartedRoom();

    const afterRoundOne = submitRoundScore(started, "host", 0, 6, 11000, 3000);
    const waitingForRoundTwo = submitRoundScore(afterRoundOne, "guest", 0, 4, null, 3500);
    expect(waitingForRoundTwo.phase).toBe("between-rounds");
    expect(waitingForRoundTwo.currentRoundIndex).toBe(0);

    const hostApprovedRoundTwo = voteForNextRound(waitingForRoundTwo, "host", 4800);
    const roundTwo = voteForNextRound(hostApprovedRoundTwo, "guest", 5000);
    expect(roundTwo.phase).toBe("playing");
    expect(roundTwo.currentRoundIndex).toBe(1);

    const afterRoundTwo = submitRoundScore(roundTwo, "host", 1, 9, 9000, 7000);
    const waitingForRoundThree = submitRoundScore(afterRoundTwo, "guest", 1, 1, null, 7100);
    expect(waitingForRoundThree.phase).toBe("between-rounds");
    expect(waitingForRoundThree.currentRoundIndex).toBe(1);

    const hostApprovedRoundThree = voteForNextRound(waitingForRoundThree, "host", 8800);
    const roundThree = voteForNextRound(hostApprovedRoundThree, "guest", 9000);
    expect(roundThree.phase).toBe("playing");
    expect(roundThree.currentRoundIndex).toBe(2);

    const afterRoundThree = submitRoundScore(roundThree, "host", 2, 5, null, 12000);
    const finished = submitRoundScore(afterRoundThree, "guest", 2, 3, null, 12100);
    expect(finished.phase).toBe("finished");
    expect(finished.players.host.roundScores).toEqual({ "0": 6, "1": 9, "2": 5 });
    expect(finished.players.guest.roundScores).toEqual({ "0": 4, "1": 1, "2": 3 });
  });

  it("normalizes legacy paused rooms into between-rounds state", () => {
    const started = createStartedRoom();
    const legacyPausedRoom = {
      ...started,
      phase: "playing" as const,
      currentRoundIndex: 1,
      roundStartedAt: null
    };

    expect(normalizeRoomState(legacyPausedRoom).phase).toBe("between-rounds");
  });

  it("fills missing submissions with zero after timeout and finishes the last round", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", {
      roundCount: 1
    });
    const started = startRoomGame(configured, "host", 2000);
    const afterHost = submitRoundScore(started, "host", 0, 8, null, 2100);
    const resolved = forceRoomProgress(afterHost, 2000 + started.settings.roundDurationSec * 1000 + 2000);

    expect(resolved.phase).toBe("finished");
    expect(resolved.players.host.roundScores["0"]).toBe(8);
    expect(resolved.players.guest.roundScores["0"]).toBe(0);
    expect(resolved.submissions["0"].guest.score).toBe(0);
    expect(resolved.submissions["0"].guest.clearTimeMs).toBeNull();
  });

  it("advances a solo round as soon as all connected players have submitted", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", {
      roundCount: 1
    });
    const started = startRoomGame(configured, "host", 2000);
    const offlineGuest = updatePlayerPresence(started, "guest", false, 2500);
    const resolved = submitRoundScore(offlineGuest, "host", 0, 8, null, 2600);

    expect(resolved.phase).toBe("finished");
    expect(resolved.players.host.roundScores["0"]).toBe(8);
    expect(resolved.players.guest.roundScores["0"]).toBe(0);
    expect(resolved.submissions["0"].host.score).toBe(8);
    expect(resolved.submissions["0"].guest.score).toBe(0);
  });

  it("treats stale heartbeats as disconnected for round completion", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", {
      roundCount: 1
    });
    const started = startRoomGame(configured, "host", 2000);
    const staleGuestRoom: RoomState = {
      ...started,
      players: {
        ...started.players,
        guest: {
          ...started.players.guest,
          connected: true,
          lastSeenAt: 0
        }
      }
    };
    const resolved = submitRoundScore(staleGuestRoom, "host", 0, 8, null, 45000);

    expect(resolved.phase).toBe("finished");
    expect(resolved.submissions["0"].host.score).toBe(8);
    expect(resolved.submissions["0"].guest.score).toBe(0);
  });

  it("advances a shared round as soon as all connected teams have submitted through their members", () => {
    const started = createSharedModeRoom(1);
    const guestOffline = updatePlayerPresence(started, "guest", false, 2200);
    const fourthOffline = updatePlayerPresence(guestOffline, "fourth", false, 2201);
    const roundReady = {
      ...fourthOffline,
      sharedTeamBoards: {
        ...fourthOffline.sharedTeamBoards,
        "0": {
          ...fourthOffline.sharedTeamBoards["0"],
          "team-1": {
            ...fourthOffline.sharedTeamBoards["0"]["team-1"],
            score: 12,
            submittedAt: 2300
          },
          "team-2": {
            ...fourthOffline.sharedTeamBoards["0"]["team-2"],
            score: 9,
            submittedAt: 2310
          }
        }
      }
    };
    const resolved = forceRoomProgress(roundReady, 2320);

    expect(resolved.phase).toBe("finished");
    expect(resolved.submissions["0"].host.score).toBe(12);
    expect(resolved.submissions["0"].guest.score).toBe(12);
    expect(resolved.submissions["0"].third.score).toBe(9);
    expect(resolved.submissions["0"].fourth.score).toBe(9);
  });

  it("allows the host to restart a finished game", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const joined = joinRoom(created, "guest", "Guest", 1500);
    const configured = updateRoomSettings(joined, "host", {
      roundCount: 1
    });
    const started = startRoomGame(configured, "host", 2000);
    const finished = submitRoundScore(started, "host", 0, 8, null, 2100);
    const restarted = startRoomGame(forceRoomProgress(finished, 2000 + started.settings.roundDurationSec * 1000 + 2000), "host", 9000);

    expect(restarted.phase).toBe("playing");
    expect(restarted.currentRoundIndex).toBe(0);
    expect(restarted.roundStartedAt).toBe(9000);
    expect(restarted.submissions).toEqual({});
    expect(restarted.nextRoundVotes).toEqual({});
    expect(restarted.players.host.roundScores).toEqual({});
    expect(restarted.players.guest.roundScores).toEqual({});
  });

  it("transfers host ownership to the earliest remaining player when the host leaves", () => {
    const created = createInitialRoom("ROOM12", "host", "Host", 1000);
    const withGuest = joinRoom(created, "guest", "Guest", 1500);
    const withThird = joinRoom(withGuest, "third", "Third", 1700);
    const afterLeave = leaveRoom(withThird, "host");

    expect(afterLeave).not.toBeNull();
    expect(afterLeave?.hostId).toBe("guest");
    expect(afterLeave?.players.guest.isHost).toBe(true);
    expect(afterLeave?.players.third.isHost).toBe(false);
  });

  it("handles sparse room data from Firebase when a second player joins", () => {
    const sparseRoom = {
      code: "ROOM12",
      hostId: "host",
      seed: "ROOM12-1000",
      createdAt: 1000,
      phase: "lobby",
      settings: {
        roundCount: 3,
        leaderboardMode: "sum",
        roundDurationSec: 120
      },
      currentRoundIndex: 0,
      roundStartedAt: null,
      players: {
        host: {
          id: "host",
          nickname: "Host",
          joinedAt: 1000,
          isHost: true,
          connected: true,
          lastSeenAt: 1000
        }
      }
    } as unknown as RoomState;

    const normalized = normalizeRoomState(sparseRoom);
    const joined = joinRoom(normalized, "guest", "Guest", 1500);

    expect(normalized.access).toEqual({
      password: null,
      isPublic: true
    });
    expect(normalized.chatMessages).toEqual([]);
    expect(normalized.nextRoundVotes).toEqual({});
    expect(joined.players.host.roundScores).toEqual({});
    expect(joined.players.guest.roundScores).toEqual({});
    expect(joined.submissions).toEqual({});
    expect(joined.players.host.teamId).toBeNull();
    expect(joined.players.host.connected).toBe(true);
  });

  it("falls back to a host-based room name when no room name is provided", () => {
    const room = normalizeRoomState(
      {
        ...createInitialRoom("ROOM12", "host", "Host", 1000),
        name: ""
      } as RoomState
    );

    expect(room.name).toBe("Host님의 방");
  });
});
