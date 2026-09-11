# ADR-0082: desktop-web 메시지 이미지는 업로드 API 전까지 클라이언트 전용이다 — 리더 하나 뒤에 두고 전송은 거부한다

> 상태: Accepted · 결정일: 2026-09-11 · 구현: `da34a447` · `8d167f16` (PR #446)
> 범위: `apps/desktop-web/src/app/features/chat/**` (이미지 컴포넌트 · `useChatImages` · `useChatImagesStore` ·
> `useImageAttachments` · `Composer`) · `apps/desktop-web/src/app/features/debug/pages/DebugImagesPage.tsx` ·
> `apps/desktop-web/tailwind.config.js`
> 관련: Figma "DoU PC" 247:10714 (이미지 케이스 · 기획 주석), 다크 팔레트 254:541 · 259:566 ·
> [ADR-0049](./0049-feedback-photo-attachment-inline-base64.md) (피드백 사진 첨부 — 다른 표면, 다른 결정)

## 맥락 (Context)

Figma "DoU PC" 247:10714는 메시지 이미지를 여섯 경우로 정의한다.

- 메뉴·닫기 버튼은 hover 시 드러난다.
- 단일 이미지는 파일명, 저장 버튼, 더보기(이미지 복사 · 파일 삭제)를 보이고, 누르면 단일 뷰어가 열린다.
- n장은 개수와 전체 다운로드 버튼을 보인다.
- 텍스트와 이미지가 함께면 텍스트가 위다.
- 4타일을 보인 뒤 나머지는 "+n"으로 접는다.
- 누르면 스레드 컬럼이 딸린 풀뷰어가 열린다.

기획 주석은 첨부 한도(10장)와 거절 안내(개수 초과 · 중복 · 미지원 형식)를 정한다.

**서버에는 이미지 업로드 API가 아직 없다.** 메시지 모델에 이미지 필드가 없으므로, 이번 작업의 범위는
"UI만"이다. 문제는 UI를 먼저 지으면 가짜 데이터 경로가 컴포넌트 곳곳에 스며들고, API가 생기는 날 그 경로를
전부 찾아 바꿔야 한다는 것이다.

## 결정 (Decision)

### 1. 읽기는 `useChatImages(messageId)` 하나로만 한다

메시지의 이미지를 읽는 곳은 `useChatImages` 한 곳이다. 지금 이 훅은 메모리 전용 zustand 스토어
`useChatImagesStore.byMessage`를 읽고, 그 스토어를 채우는 것은 디버그 패널의 Images 탭뿐이다. Images 탭은
열린 채널의 최근 메시지 4개에 1 · 2 · 4 · 10장짜리 샘플을 붙인다.

API가 생기면 **컴포넌트가 아니라 이 리더를 바꾼다.** `MessageRow`와 `MessageImages`는 `ChatImage { id, name,
url, isUploading? }`만 안다. `url`은 지금은 object URL이고, 나중에는 업로드된 파일의 URL이 된다.

### 2. 이미지가 있는 전송은 통째로 거부한다

첨부가 있으면 `Composer`의 submit이 `chat.attach.unavailable` toast를 띄우고 멈춘다. 텍스트와 트레이는 그대로
남는다. 전송 가드는 `Composer`가 소유하고, `onSend`는 `(content: string) => void`로 둔다.

### 3. 첨부 규칙은 순수 함수 하나가 판정한다

`validateAttachments(existingKeys, incoming)`가 규칙을 한곳에서 판정한다.

- 형식은 `png` · `jpeg` · `gif` · `webp`만 받는다. HEIC 등은 깨진 채 보이느니 거절한다.
- 같은 파일은 `이름:크기:mtime` 키로 한 번만 받는다. 내용 해시는 드롭마다 파일 전체를 읽어야 해서 쓰지 않는다.
- 트레이는 최대 10장이고, 12장을 떨어뜨리면 앞의 10장만 남는다.
- 거절 안내는 드롭당 하나다. 먼저 만난 사유 하나만 보이며, 안내 셋이 쌓이면 오류처럼 읽힌다.

피드는 4타일을 그리고 마지막 타일을 "+n"으로 바꾼다(`MAX_VISIBLE_TILES`).

### 4. 삭제는 지금 스토어에 직접 쓴다 — API가 생기면 낙관적 mutation이 된다

더보기의 "파일 삭제"는 확인 대화상자를 거쳐 `useChatImagesStore.removeImage`를 부른다. 이것이 리더 밖의 유일한
쓰기다. 서버 필드가 생기면 이 호출은 리포 규칙(POST · PUT · DELETE는 캐시에 먼저 쓰고 실패 시 롤백)을 따르는
mutation으로 바뀌어야 한다.

### 5. 라이브러리 마크업은 Tailwind `content`에 경로로 명시한다

`createGlobPatternsForDependencies`는 nx 프로젝트 그래프를 읽는데, 그래프 없이 도는 plain `vite` ·
`vite build`에서는 `[]`를 반환한다. 그래서 `libs/ui-kit`에서만 쓰는 클래스(`bg-popover`, 다이얼로그의
`left-[50%]` 중앙 정렬)가 CSS에 생성되지 않았다. 이미지 뷰어와 더보기 메뉴가 투명하거나 화면 밖에 그려진 원인이
이것이다. `tailwind.config.js`에 `libs/{ui-kit,block-kit}`를 직접 적었다.

## 대안 (Alternatives)

- **첨부가 있으면 텍스트만 보낸다** — 기각. 사용자는 이미지가 빠진 것을 모른 채 메시지가 나간다.
- **이미지를 버리고 조용히 보낸다** — 기각. 같은 이유다.
- **이미지를 base64로 본문에 싣는다(ADR-0049 방식)** — 기각. 채팅 메시지는 모든 참여자의 캐시와 소켓으로
  퍼진다. 피드백 한 건과 달리 그 크기를 감당할 경로가 없다.
- **`createGlobPatternsForDependencies`만 믿는다** — 기각. 개발 서버와 빌드가 모두 그래프 없이 돈다.

## 결과 (Consequences)

### 얻는 것

- Figma의 여섯 경우를 실제 레이아웃에서 확인할 수 있다: 디버그 패널 Images 탭에서 "Attach samples"를 누른다.
- API가 생기면 바꿀 곳이 리더 한 곳과 삭제 호출 한 곳으로 좁다.

### 감수하는 트레이드오프

- 이미지는 그 창의 메모리에만 있다. 새로고침하면 사라지고, 다른 참여자에게는 보이지 않는다.
- 이 PR에는 같은 Figma 정렬 작업의 동작 변경 셋이 함께 들어 있다.
    - 사이드바 행이 34px 한 줄로 바뀌면서, 보이던 마지막 메시지 미리보기가 `title` 툴팁으로 옮겨졌다.
    - 컴포저 툴바에서 코드블록 버튼이 빠졌다(Figma 툴바는 B · I · S · `</>`).
    - 채널 unread 표시는 아직 개수가 아니라 점이다.

### 되돌리는 방법

이미지 UI는 `useChatImages`가 빈 배열을 돌려주는 한 그려지지 않는다. 스토어를 채우는 것은 디버그 탭뿐이라,
운영 사용자에게는 이미 보이지 않는다. 첨부 입구를 닫으려면 두 곳을 손본다. "+" 메뉴와 붙여넣기는 `Composer`에
넘기는 `onAddFiles`를 빼면 닫힌다. 드롭은 `ChatPane` · `ThreadPanel`의 `useFileDrop`을 떼야 닫힌다.

## 다음 단계

- 업로드 API가 생기면 `useChatImages`가 메시지의 서버 필드를 읽게 하고, 전송 거부 가드를 업로드 흐름으로 바꾼다.
- 삭제를 낙관적 mutation으로 옮긴다(결정 4).
