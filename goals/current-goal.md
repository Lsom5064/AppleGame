# Project Goal

## Outcome
React + TypeScript + Vite 기반의 사과 합 10 멀티플레이 게임을 로컬 개발 환경과 GitHub Pages 프론트엔드 + Firebase Realtime Database 백엔드 조합으로 모두 실행 가능하게 완성한다.

## Verification
- `npm run build`가 성공해야 한다.
- `npm run test`가 성공해야 한다.
- 방 만들기, 방 참여하기, 라운드 진행, 최종 리더보드 흐름이 동작해야 한다.
- GitHub Pages 배포 워크플로와 설정이 저장소에 포함되어야 한다.
- Firebase 익명 인증 기반 식별과 Realtime Database 사용 흐름이 코드와 문서에 반영되어야 한다.
- README에 설치 방법, 환경변수 설정, Firebase 설정, GitHub Pages 배포 방법, 사용법이 포함되어야 한다.

## Constraints
- `Math.random()` 대신 seed 기반 pseudo random generator를 사용한다.
- 원본 `apple_box.js`의 코드를 직접 재사용하지 않는다.
- React + TypeScript + Vite 스택을 유지한다.
- 정적 프론트엔드는 GitHub Pages에서 동작해야 하고, 실시간 데이터는 Firebase Realtime Database를 사용한다.
- Firebase가 설정된 경우 익명 인증과 탭 단위 세션 퍼시스턴스를 사용해 플레이어 식별을 처리한다.

## Boundaries
- 작업 대상은 `src/`, `README.md`, `.env.example`, `goals/`, `scripts/`로 제한한다.
- 필요 시 테스트와 문서를 추가할 수 있다.

## Iteration Policy
각 변경 후 관련 테스트와 빌드를 실행해 검증하고, 실패하면 원인을 수정한 뒤 다시 검증한다.

## Blocked Stop Condition
Firebase 인증 정보, GitHub Pages 저장소 권한, 외부 권한, 제품 요구사항 결정처럼 현재 저장소 밖의 입력이 필요하면 필요한 항목을 명확히 적고 정지한다.
