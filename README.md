# Apple Sum 10 Multiplayer

React + TypeScript + Vite 기반의 멀티플레이 웹게임입니다. 플레이어가 사각형으로 드래그한 범위 안의 사과 숫자 합이 정확히 `10`이면 해당 사과가 제거되고 점수가 올라갑니다. 여러 플레이어가 같은 방에 들어와 같은 `room seed + round index` 배치를 동시에 플레이합니다.

이 프로젝트는 저장소에 있던 `apple_box.js`를 직접 재사용하지 않고, 요구사항을 기준으로 새로 구현한 버전입니다.

## 프로젝트 설명

- 시작 화면에서 닉네임 입력, 방 만들기, 방 참여하기를 지원합니다.
- 방장은 총 라운드 수(`1 / 3 / 5`)와 리더보드 계산 방식(`sum / best`)을 설정할 수 있습니다.
- 같은 방의 모든 플레이어는 같은 시드 기반 사과 배치를 플레이합니다.
- 마우스 드래그와 모바일 터치 드래그를 모두 지원합니다.
- 기본 제한 시간은 라운드당 `120초`입니다.
- 리더보드는 라운드별 점수와 최종 점수를 함께 보여줍니다.

## 설치 방법

```bash
npm install
npm run dev
```

빌드 확인:

```bash
npm run build
```

테스트 실행:

```bash
npm run test
```

Goal 문자열 생성:

```bash
npm run goal:print
```

## 환경변수 설정 방법

1. `.env.example`을 복사해서 `.env`를 만듭니다.
2. 아래 값을 자신의 Firebase 프로젝트 값으로 채웁니다.

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Firebase 환경변수가 없더라도 UI는 로컬 폴백 모드로 실행됩니다. 이 경우 같은 브라우저 origin 안에서도 탭별 `sessionStorage`를 사용해 간단한 로컬 멀티플레이를 테스트할 수 있습니다.

GitHub Pages 배포 시에는 로컬 `.env` 대신 GitHub 저장소의 `Settings > Secrets and variables > Actions`에 같은 이름으로 값을 등록해야 합니다.

## Firebase Realtime Database 설정 방법

1. Firebase Console에서 새 프로젝트를 생성합니다.
2. Realtime Database를 활성화합니다.
3. Authentication에서 `Anonymous` 로그인을 활성화합니다.
4. Web App을 등록하고 `.env`에 필요한 키를 넣습니다.
5. 개발 초기에는 저장소의 [scripts/firebase.database.rules.json](/Users/hai/Desktop/AppleGame/scripts/firebase.database.rules.json:1) 같은 익명 인증 허용 규칙으로 시작할 수 있습니다.

예시 규칙:

```json
{
  "rules": {
    "rooms": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

현재 앱은 Firebase가 설정된 경우 브라우저에서 자동으로 익명 인증 세션을 만들고, `browserSessionPersistence`를 사용해 탭 단위 세션으로 유지한 뒤 그 `uid`를 플레이어 식별자로 사용합니다. 실서비스에서는 여기에 추가 제약 규칙을 더 넣는 편이 안전합니다.

여러 명 플레이를 같은 PC에서 확인하려면 서로 다른 브라우저, 시크릿 창, 별도 브라우저 프로필을 사용하는 편이 가장 확실합니다. 같은 브라우저에서도 새 탭 기준으로 별도 익명 세션이 만들어질 수 있지만, 테스트 환경에 따라 브라우저 동작 차이가 있을 수 있습니다.

## 방 만들기 / 참여하기 사용법

1. 홈 화면에서 닉네임을 입력합니다.
2. `방 만들기`를 누르면 랜덤 방 코드가 생성되고 대기방으로 이동합니다.
3. 방장은 라운드 수와 리더보드 방식을 설정한 뒤 `게임 시작`을 누릅니다.
4. 다른 참가자는 `방 참여하기`에서 방 코드를 입력해 대기방에 들어옵니다.
5. 게임이 시작되면 참가자 전원이 같은 판을 플레이합니다.

## 배포 방법

이 프로젝트의 추천 배포 구조는 `GitHub Pages + Firebase Realtime Database`입니다. 프론트엔드는 GitHub Pages에 배포하고, 실시간 멀티플레이 상태는 Firebase가 담당합니다.

### GitHub Pages 배포

1. GitHub 저장소에 코드를 push합니다.
2. 저장소 `Settings > Pages`에서 `Build and deployment` 소스를 `GitHub Actions`로 선택합니다.
3. 저장소 `Settings > Secrets and variables > Actions`에 아래 시크릿을 등록합니다.

```bash
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

4. `main` 브랜치에 push하면 [.github/workflows/deploy-pages.yml](/Users/hai/Desktop/AppleGame/.github/workflows/deploy-pages.yml:1)이 자동으로 빌드 후 배포합니다.

정적 자산 경로는 GitHub Pages에서 안전하게 동작하도록 [vite.config.ts](/Users/hai/Desktop/AppleGame/vite.config.ts:1)에서 `base: "./"`로 설정했습니다.

### 수동 빌드 확인

```bash
npm run build
```

생성된 `dist` 폴더는 정적 산출물이며, 필요하면 다른 정적 호스팅에도 그대로 배포할 수 있습니다.

## Goal 운영 방법

`/goal`은 파일 자체를 직접 참조하는 기능이 아니라, 현재 스레드에 붙는 목표 텍스트입니다. 그래서 이 저장소에서는 `goals/current-goal.md`를 원본으로 두고, `scripts/print-goal.sh`가 그 내용을 `/goal`에 넣기 좋은 한 줄 문장으로 변환하도록 구성했습니다.

사용 순서:

1. `goals/current-goal.md`를 수정합니다.
2. `npm run goal:print`를 실행합니다.
3. 출력된 한 줄을 그대로 복사해서 Codex 입력창에서 `/goal ...`로 실행합니다.
4. 목표가 바뀌면 `/goal clear` 후 새 출력으로 다시 설정합니다.

Codex 내부에서 직접 쓰는 명령 예시는 아래와 같습니다.

```text
/goal React + TypeScript + Vite 기반의 사과 합 10 멀티플레이 게임을 GitHub Pages + Firebase 구조로 완성한다 ...
/goal pause
/goal resume
/goal clear
```

다른 파일을 쓰고 싶으면 직접 경로를 넘길 수 있습니다.

```bash
./scripts/print-goal.sh goals/current-goal.md
```

## 구현 메모

- 시드 랜덤은 `Math.random()` 대신 별도 PRNG로 구현했습니다.
- 방 코드 생성, 리더보드 계산, 라운드 진행, 점수 계산 로직을 `utils`로 분리했습니다.
- 핵심 유틸에 대해 `vitest` 테스트를 추가했습니다.
# AppleGame
# AppleGame
