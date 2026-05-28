import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase, get, goOffline, onValue, ref, remove, runTransaction, set } from "firebase/database";

const BOARD_GRID_COLUMNS = 17;
const BOARD_GRID_ROWS = 10;
const APPLE_COUNT = BOARD_GRID_COLUMNS * BOARD_GRID_ROWS;
const APPLE_WIDTH = 38;
const APPLE_HEIGHT = 50;
const PLAYFIELD_INSET_LEFT = 42;
const PLAYFIELD_SIDE_MARGIN = 37;
const APPLE_START_X = PLAYFIELD_INSET_LEFT + PLAYFIELD_SIDE_MARGIN + APPLE_WIDTH / 2;
const APPLE_START_Y = 112;
const APPLE_SPACING_X = 40;
const APPLE_SPACING_Y = 55;

function loadEnv() {
  const entries = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    });

  return Object.fromEntries(entries);
}

function hashStringToSeed(input) {
  let hash = 1779033703 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);

  return (hash ^ (hash >>> 16)) >>> 0;
}

function createSeededRandom(seedInput) {
  let seed = hashStringToSeed(seedInput) || 1;

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateApples(seed) {
  const random = createSeededRandom(seed);
  const slots = [];

  for (let row = 0; row < BOARD_GRID_ROWS; row += 1) {
    for (let column = 0; column < BOARD_GRID_COLUMNS; column += 1) {
      slots.push({
        column,
        row,
        x: APPLE_START_X + column * APPLE_SPACING_X,
        y: APPLE_START_Y + row * APPLE_SPACING_Y
      });
    }
  }

  while (true) {
    let sum = 0;
    let hasSingleTen = false;
    const values = [];

    for (let index = 0; index < APPLE_COUNT; index += 1) {
      if (index === APPLE_COUNT - 1) {
        const adjustedValue = 10 - (sum % 10);
        values.push(adjustedValue);
        hasSingleTen = adjustedValue === 10;
        continue;
      }

      const value = 1 + Math.floor(random() * 9);
      values.push(value);
      sum += value;
    }

    if (!hasSingleTen) {
      return slots.map((slot, index) => ({
        id: `${seed}-${slot.column}-${slot.row}`,
        value: values[index]
      }));
    }
  }
}

function findTenSelection(apples, excludedIds = new Set()) {
  const candidates = apples.filter((apple) => !excludedIds.has(apple.id));

  for (let left = 0; left < candidates.length; left += 1) {
    for (let middle = left + 1; middle < candidates.length; middle += 1) {
      for (let right = middle + 1; right < candidates.length; right += 1) {
        const selection = [candidates[left], candidates[middle], candidates[right]];
        const sum = selection.reduce((total, apple) => total + apple.value, 0);

        if (sum === 10) {
          return selection.map((apple) => apple.id);
        }
      }
    }
  }

  throw new Error("합계 10 선택지를 찾지 못했습니다.");
}

function applySelection(seed, board, appleIds) {
  const currentBoard = board ?? {
    teamId: "team-1",
    removedAppleIds: [],
    score: 0,
    clearTimeMs: null,
    submittedAt: null
  };
  const removedAppleIds = new Set(currentBoard.removedAppleIds ?? []);

  if (appleIds.some((appleId) => removedAppleIds.has(appleId))) {
    return currentBoard;
  }

  const values = new Map(generateApples(seed).map((apple) => [apple.id, apple.value]));
  const sum = appleIds.reduce((total, appleId) => total + (values.get(appleId) ?? 0), 0);

  if (sum !== 10) {
    return currentBoard;
  }

  const nextRemovedAppleIds = [...(currentBoard.removedAppleIds ?? []), ...appleIds];
  return {
    ...currentBoard,
    removedAppleIds: nextRemovedAppleIds,
    score: (currentBoard.score ?? 0) + appleIds.length,
    clearTimeMs: nextRemovedAppleIds.length >= APPLE_COUNT ? 1000 : null,
    submittedAt: null
  };
}

function waitForValue(targetRef, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Firebase smoke check timed out."));
    }, timeoutMs);
    const unsubscribe = onValue(targetRef, (snapshot) => {
      const value = snapshot.val();

      if (predicate(value)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(value);
      }
    });
  });
}

async function setPointerWithFallback(db, roomCode, playerId, pointer) {
  try {
    await set(ref(db, `roomPointers/${roomCode}/${playerId}`), pointer);
    return `roomPointers/${roomCode}/${playerId}`;
  } catch {
    await set(ref(db, `rooms/${roomCode}/teamPointers/${playerId}`), pointer);
    return `rooms/${roomCode}/teamPointers/${playerId}`;
  }
}

async function main() {
  const env = loadEnv();
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };

  if (Object.values(firebaseConfig).some((value) => !value)) {
    throw new Error(".env Firebase 설정이 필요합니다.");
  }

  const clients = await Promise.all(
    Array.from({ length: 4 }, async (_, index) => {
      const app = initializeApp(firebaseConfig, `shared-board-smoke-${Date.now()}-${index}`);
      const auth = getAuth(app);
      const credential = await signInAnonymously(auth);
      return {
        app,
        uid: credential.user.uid,
        db: getDatabase(app)
      };
    })
  );

  const roomCode = `T${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const seed = `${roomCode}-smoke`;
  const now = Date.now();
  const players = {
    [clients[0].uid]: {
      id: clients[0].uid,
      nickname: "SmokeHost",
      joinedAt: now,
      isHost: true,
      connected: true,
      lastSeenAt: now,
      roundScores: {},
      teamId: "team-1"
    },
    [clients[1].uid]: {
      id: clients[1].uid,
      nickname: "SmokeMate",
      joinedAt: now + 1,
      isHost: false,
      connected: true,
      lastSeenAt: now,
      roundScores: {},
      teamId: "team-1"
    },
    [clients[2].uid]: {
      id: clients[2].uid,
      nickname: "SmokeOtherA",
      joinedAt: now + 2,
      isHost: false,
      connected: true,
      lastSeenAt: now,
      roundScores: {},
      teamId: "team-2"
    },
    [clients[3].uid]: {
      id: clients[3].uid,
      nickname: "SmokeOtherB",
      joinedAt: now + 3,
      isHost: false,
      connected: true,
      lastSeenAt: now,
      roundScores: {},
      teamId: "team-2"
    }
  };
  const room = {
    code: roomCode,
    name: "Firebase Smoke",
    hostId: clients[0].uid,
    seed,
    createdAt: now,
    phase: "playing",
    settings: {
      roundCount: 1,
      leaderboardMode: "sum",
      roundDurationSec: 120,
      gameMode: "team",
      teamMode: "shared",
      teamCount: 2
    },
    access: {
      password: null,
      isPublic: false
    },
    currentRoundIndex: 0,
    roundStartedAt: now,
    players,
    teams: [
      { id: "team-1", name: "1팀" },
      { id: "team-2", name: "2팀" }
    ],
    sharedTeamBoards: {
      "0": {
        "team-1": {
          teamId: "team-1",
          removedAppleIds: [],
          score: 0,
          clearTimeMs: null,
          submittedAt: null
        },
        "team-2": {
          teamId: "team-2",
          removedAppleIds: [],
          score: 0,
          clearTimeMs: null,
          submittedAt: null
        }
      }
    },
    teamPointers: {},
    submissions: {},
    nextRoundVotes: {},
    chatMessages: []
  };

  const hostDb = clients[0].db;
  const roomRef = ref(hostDb, `rooms/${roomCode}`);
  const teamOneBoardRef = ref(clients[1].db, `rooms/${roomCode}/sharedTeamBoards/0/team-1`);
  const teamTwoBoardRef = ref(clients[3].db, `rooms/${roomCode}/sharedTeamBoards/0/team-2`);
  let pointerPath = `roomPointers/${roomCode}/${clients[0].uid}`;

  try {
    await set(roomRef, room);

    pointerPath = await setPointerWithFallback(hostDb, roomCode, clients[0].uid, {
      playerId: clients[0].uid,
      teamId: "team-1",
      roundIndex: 0,
      x: 120,
      y: 160,
      active: true,
      dragging: true,
      selectionStartX: 90,
      selectionStartY: 130,
      updatedAt: Date.now()
    });

    await waitForValue(ref(clients[1].db, pointerPath), (pointer) =>
      pointer?.dragging === true && pointer?.teamId === "team-1"
    );

    const apples = generateApples(`${seed}:0`);
    const teamOneSelection = findTenSelection(apples);
    const excluded = new Set(teamOneSelection);
    const teamTwoSelection = findTenSelection(apples, excluded);

    await Promise.all([
      runTransaction(ref(clients[0].db, `rooms/${roomCode}/sharedTeamBoards/0/team-1`), (board) =>
        applySelection(`${seed}:0`, board, teamOneSelection)
      ),
      runTransaction(ref(clients[2].db, `rooms/${roomCode}/sharedTeamBoards/0/team-2`), (board) =>
        applySelection(`${seed}:0`, { ...board, teamId: "team-2" }, teamTwoSelection)
      )
    ]);

    await waitForValue(teamOneBoardRef, (board) => board?.score === teamOneSelection.length);
    await waitForValue(teamTwoBoardRef, (board) => board?.score === teamTwoSelection.length);

    const [teamOneSnapshot, teamTwoSnapshot] = await Promise.all([get(teamOneBoardRef), get(teamTwoBoardRef)]);
    const teamOneBoard = teamOneSnapshot.val();
    const teamTwoBoard = teamTwoSnapshot.val();

    if (teamOneBoard.removedAppleIds.length !== teamOneSelection.length) {
      throw new Error("1팀 보드 제거 상태가 동기화되지 않았습니다.");
    }

    if (teamTwoBoard.removedAppleIds.length !== teamTwoSelection.length) {
      throw new Error("2팀 보드 제거 상태가 동기화되지 않았습니다.");
    }

    console.log(`Firebase shared-board smoke passed for room ${roomCode} using ${pointerPath}.`);
  } finally {
    await Promise.allSettled([
      remove(ref(clients[0].db, pointerPath)),
      remove(ref(clients[0].db, `rooms/${roomCode}`))
    ]);
    for (const client of clients) {
      goOffline(client.db);
    }
    await Promise.all(clients.map((client) => deleteApp(client.app)));
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
