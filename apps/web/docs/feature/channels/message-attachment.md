# channels — 메시지 첨부 (attach$)

> 상태: Live · 최종 갱신: 2026-09-01 · 대상: `apps/web/src/app/features/channels`
> 서버 계약: `@lemoncloud/chatic-socials-api`의 `ChatAttachment` (0.26.810+)

평문 `content`에 딸려 오는 **구조화 첨부**를 방 화면이 어떻게 그리는지 정리한다. OG 태그를 긁어
카드를 만드는 [링크 프리뷰](../../../../../docs/chat-link-preview.md)와는 다른 것이다 — 이쪽은
**발신자가 채워 보낸 페이로드**이고, 저쪽은 본문에서 URL을 찾아 우리가 파생시킨 것이다.

## 핵심

- `ChatModel.attach$`는 **Slack attachment 계보**다: `pretext` · `title` · `text` · `color` ·
  `username` · `ts` · `footer` · `sourceUrl` · `fields[]`.
- **서버는 해석하지 않고 보존만 한다.** 발신측이 body에 `meta`로 실으면 모델에 `attach$`로 담긴다
  (`meta`는 `CoreModel`이 예약한 이름이라 못 쓴다). 따라서 **검증과 방어는 전부 클라이언트 몫**이다.
- 현재 발행처는 `stereo='webhook'`(외부 연동 알람 — 에러 리포트)뿐이지만, 렌더는 출처에 매이지
  않는다. `attach$`가 있으면 그린다.
- `webhook`은 unread·push에서 `user`와 동일 취급이라 클라이언트가 따로 할 일이 없다. `isSystem`은
  `stereo === 'system'`이므로 webhook 메시지는 **일반 버블**로 그려진다.

## 데이터 흐름 — 배선이 없다

```
ChatModel.attach$  →  ChatView (Partial<ChatModel>, attach$ 미제외)
                   →  CacheChatView = ChatView & …
                   →  DomainChat    (toDomainChat 이 `...api` 로 펼침)
                   →  ClientChatView extends DomainChat
                   →  ChannelMessageRow
```

매퍼가 화이트리스트가 아니라 스프레드라, 패키지 버전을 올리는 것 말고 도메인/캐시 쪽에 손댈 것이
없다. 네이티브 캐시도 행을 `data` blob으로 저장하므로 새 필드가 그대로 실린다.

## 렌더

[`MessageAttachment.tsx`](../../../src/app/features/channels/components/MessageAttachment.tsx)가
카드를 그리고, [`ChannelMessageRow`](../../../src/app/features/channels/components/ChannelMessageRow.tsx)가
**말풍선 바로 아래·언펄 카드 위**에 놓는다. 순서에 이유가 있다: `attach$`는 발신자가 보낸 본문의
일부이고, 언펄은 우리가 본문에서 찾아낸 URL로 만든 부가물이다.

판정은 순수 함수 셋이 갖는다
([`utils/chatAttachment.ts`](../../../src/app/features/channels/utils/chatAttachment.ts)):

| 함수                      | 하는 일                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `hasAttachmentContent`    | 그릴 것이 하나라도 있는지. `{}`나 공백뿐이면 **빈 카드를 그리지 않는다** |
| `resolveAttachmentAccent` | `color` → 왼쪽 레일 색                                                   |
| `safeAttachmentUrl`       | `sourceUrl`이 쓸 수 있는 링크인지                                        |

### 색 (`color`)

`danger` → `--destructive`, `good` → `--main-accent`, `warning` → `#F5A623`(킷에 앰버 토큰이 없어
리터럴), `#hex` → 그대로. **모르는 값과 빈 값은 중립 테두리로 떨어진다** — 색을 지어내면 심각도를
잘못 말하게 되고, 비워 두면 레일이 사라진다.

### 링크 (`sourceUrl`) — 두 겹의 방어

1. **스킴 검증.** `http`/`https`만 통과시킨다. 첨부 본문은 서버가 그대로 보존하는 webhook 입력이라
   `javascript:`·`data:`가 `href`에 닿을 수 있고, 이 값은 네이티브 셸에서 **OS 브라우저로 그대로
   넘어간다.** 걸러진 링크는 버튼 자체를 내주지 않는다.
2. **외부 열기.** 앵커 기본 동작이 아니라 `openExternalUrl`로 보낸다 — 웹뷰에 띄우면 세션 쿠키를
   단 채 돌아올 길 없는 페이지에 갇힌다(`MessageText`의 URL과 같은 규칙).

### 시각 규칙

디자인 시안이 없는 화면이라, 값은 주변 메시지 표면에서 가져왔다 — 12px 보조/14px 본문, `--surface`
바탕, 좌측 4px 레일. `ts`는 이 앱에서 **유일하게 epoch 초**다(다른 타임스탬프는 ms).

## 검증 방법

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

| 파일                                                                                                   | 검증 대상                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [chatAttachment.test.ts](../../../src/app/features/channels/utils/chatAttachment.test.ts)              | 스킴 필터(js/data/file/상대경로), 빈 첨부 판정, 색 매핑·hex·미상 폴백     |
| [MessageAttachment.test.tsx](../../../src/app/features/channels/components/MessageAttachment.test.tsx) | 필드 렌더, 외부 열기 경유, 위험 스킴이면 링크 미노출, 레일 색, 초 단위 ts |

**수동 확인** — webhook 토큰으로 `POST /chats/0/send`에 `meta`를 실어 보내면 방에 카드가 뜬다.

## 알려진 한계

- **디자이너 시안 없음.** 타입 스케일·간격은 주변에서 유추한 값이라 확인 대상이다.
- **`fields`의 레이아웃은 1열이다.** Slack은 `short` 플래그로 2열을 쓰지만 계약에 그 필드가 없다.
- **`text`는 평문으로만 그린다.** 본문 메시지와 달리 마크다운·URL 토크나이즈를 돌리지 않는다 —
  발신자가 신뢰 경계 밖이라 링크화 대상을 늘리지 않았다.
