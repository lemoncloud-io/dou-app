# Block Kit 메시지 — 서버 ↔ 클라이언트 수신 규격 v1

작성: 2026-08-14 · 브랜치 `feat/desktop-web-block-kit` · PR #422
모바일(`apps/web`) 확대: 2026-09-08 · 브랜치 `feat/mobile-block-kit`
대상: chatic-socials-api / webhook 발신 측
클라이언트 구현: `libs/block-kit/`(타입·리더·렌더러 — desktop-web·`apps/web`·블록킷 빌더가 공유),
`libs/block-kit/src/resolveChatBlocks.ts`(읽기 우선순위)

## 1. 무엇을 하려는 것인가

에러 리포트나 배포 알림처럼 **구조가 있는 메시지**를 평문 한 덩어리가 아니라 제목·구분선·
필드 표로 보여주려 한다. 자체 포맷을 새로 정의하는 대신 Slack Block Kit의 부분집합을 그대로
쓰기로 했다 — 발신 측이 이미 아는 스키마이고, 클라이언트에 표시 규칙이 이미 문서화되어 있다.

이 문서는 **서버가 무엇을 보내면 되는가**만 다룬다. 렌더링 구현은 위 경로에 있다.

## 2. 전달 방법

**2026-09 갱신 — 별도 필드가 생겼다.** 서버(`chatic-socials-api`)가 webhook 발신 메시지에
한해 `meta`에서 만든 `chat.blocks$` 필드를 저장한다. 계약 정본은
`lemoncloud-io/knowledge#319`
`projects/@lemoncloud-io/chatic-socials-api/webhook-message-blocks/SPEC.md` §6(dou-app
클라이언트 계약)이다 — 아래 표는 그 §6과 어긋나지 않게 고친 것이다. 원래 있던 `content` 판정
경로는 폴백으로 그대로 남는다.

읽는 순서는 `chat.blocks$` → `content` 판정 → 평문이고, 정본은
`resolveChatBlocks`(`libs/block-kit/src/resolveChatBlocks.ts`) 하나다.

| 항목          | 규칙                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocks$`     | 서버가 `meta`에서 만들어 저장하는 배열. 있고 비어 있지 않으면 우선 사용한다. webhook 발신 메시지에만 채워진다                                                  |
| `content`     | `blocks$`가 없을 때 `{"blocks":[...]}` 형태의 JSON 문자열로 판정. 최상위는 객체, `blocks`는 배열. `blocks$` 경로에서는 이 필드가 서버가 만든 평문 요약이다(§6) |
| `contentType` | **보지 않는다.** 두 경로 모두 해당. `text`로 보내도 무관하니 맞출 필요 없다                                                                                    |
| `stereo`      | **`system`만 아니면 된다.** webhook 메시지는 `stereo: 'webhook'`으로 온다 — `system`이면 시스템 알림 렌더러를 타서 블록이 그려지지 않는다                      |

`content` 판정은 마커가 아니라 내용으로 한다: `content.trim()`이 `{`로 시작하고, 파싱한 결과가
`blocks` 배열을 가진 객체일 때만 블록 메시지로 취급한다. 그 외에는 지금까지처럼 평문이다.

> `contentType`을 신뢰하지 않는 이유: 값이 서버 쪽에서 확정되지 않았고, 클라이언트의 자체
> 전송 경로가 기본값으로 `'text'`를 찍는다. 마커로 판정했다면 모든 메시지에 "블록 아님"이라
> 답하면서 테스트는 전부 통과하는 상태가 될 수 있었다.

## 3. 인터페이스

클라이언트가 실제로 파싱하는 타입이다.

```ts
interface BlockKitPayload {
    blocks: Block[];
}

type Block = SectionBlock | HeaderBlock | DividerBlock | ContextBlock;

/** Slack composition object. plain_text는 문자 그대로, mrkdwn은 파서를 탄다. */
interface TextObject {
    type: 'mrkdwn' | 'plain_text';
    text: string;
}

interface SectionBlock {
    type: 'section';
    text?: TextObject;
    /** 2열 그리드로 그린다. "*라벨*\n값" 형태를 권장. */
    fields?: TextObject[];
}

interface HeaderBlock {
    type: 'header';
    /** plain_text 전용. mrkdwn을 넣으면 마크가 문자 그대로 나온다. */
    text: TextObject;
    /** 1–4 → H1–H4. 없으면 1. */
    level?: number;
}

interface DividerBlock {
    type: 'divider';
}

interface ContextBlock {
    type: 'context';
    /** 작은 회색 한 줄. 공백 하나씩 띄워 이어붙인다. */
    elements: TextObject[];
}
```

선언에 없는 필드(`block_id`, `accessory`, `style` 등)는 무시한다 — 보내도 무해하다.
필수 필드가 빠진 블록(예: `text` 없는 `header`)은 미지원 블록과 같은 취급이다(§5).

## 4. mrkdwn 지원 문법

`*굵게*` · `_기울임_` · `~취소선~` · `` `코드` `` · ` ```코드블록``` ` ·
`<url|라벨>` · `<url>` · `<@U123>` · `<!here>` · `<!channel>`

- **구분자가 단어 안에 있으면 마크로 읽지 않는다.** `user_id`, `not_found`는 밑줄이 유지된다.
- `<`, `>`, `&`는 Slack 규칙대로 `&lt;` `&gt;` `&amp;`로 이스케이프한다.
- `\n` 줄바꿈은 그대로 유효하다.
- `<@U123>`은 조회할 사용자 디렉터리가 없어 ID를 그대로 멘션 칩으로 표시한다.

**Slack 방언이 아니라는 점에 주의.** 이 앱의 작성기는 `**굵게**`(별 두 개)를 쓴다.
즉 `**x**`를 mrkdwn 텍스트에 넣으면 굵어지지 않고 별표가 그대로 보인다. Block Kit 텍스트는
Slack 문법으로만 쓴다.

## 5. 지원 범위와 실패 동작

지원: `header` · `section` · `divider` · `context`.

그 외(`image`, `actions`, `rich_text` …)는 **깨지지 않는다.**
`UNSUPPORTED BLOCK · ACTIONS` 라벨과 함께 그 블록의 원문 JSON을 보여준다.

| 상황                           | 결과                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 일부 블록만 미지원             | 아는 블록은 그리고, 그 자리에만 원문 JSON을 라벨과 함께 표시                                                                                    |
| 전부 미지원                    | 원문 문자열 전체를 평문 메시지로 표시 (JSON 조각을 쌓지 않는다)                                                                                 |
| JSON 파싱 실패 · `blocks` 없음 | 원문 문자열을 평문 메시지로 표시                                                                                                                |
| `blocks$`가 빈 배열            | `content` 판정으로 폴백. 서버는 빈 배열 대신 필드 자체를 비운다고 약속하지만(SPEC §3), 클라이언트는 그 약속을 믿지 않고 빈 말풍선 대신 폴백한다 |
| 기존 평문 메시지               | 영향 없음                                                                                                                                       |

크래시도, 빈 말풍선도 발생하지 않는다.

`actions`(버튼)를 뺀 것은 의도적이다 — 버튼을 눌러 되돌려 보낼 interactivity 엔드포인트가
이 앱에 없다. 누를 수 없는 버튼을 그리면 거짓말이 된다.

## 6. 한 줄로 접히는 표면

사이드바 프리뷰 · OS 알림 · 검색 결과 · 클립보드 복사 · 삭제 확인 다이얼로그는 `content` 판정
경로(`parseBlocks(content)`)에서만 블록을 평문으로 접는다. 규칙:

- 블록 순서대로 텍스트를 이어붙이고 블록 사이는 개행으로 구분한다.
- mrkdwn 마크는 제거된다. `<url|라벨>`은 라벨만 남는다.
- **미지원 블록의 원문 JSON은 여기에 포함되지 않는다** (다른 블록에 텍스트가 있는 한).

따라서 **첫 `header` 또는 첫 `section`에 요약이 오도록** 배치해 주면 프리뷰가 읽을 만해진다.

**`blocks$` 경로(§2)는 다르다.** 위 다섯 표면 중 사이드바 프리뷰·OS 알림·검색은
`messagePlainText`(`apps/desktop-web/src/app/shared/utils/messagePlainText.ts`)를 거치고,
클립보드 복사와 삭제 확인은 `MessageRow`가 계산해 둔 `plain`을 쓴다. 경로는 둘이지만 규칙은
하나다 — 어느 쪽도 `blocks$`를 접지 않고 `chat.content`를 읽는다.
webhook 메시지의 `content`는 서버가 이미 만들어 둔 평문 요약이라(SPEC §6-5) `parseBlocks`가
`null`을 돌려주고 `stripMarkdown(content)`로 그대로 떨어진다 — 블록을 접을 필요가 없다.
`messagePlainText`가 인자를 하나로 유지하는 이유가 이것이다(dou-app 플랜
`.claude/20260907/PLAN-16-59-21.md` D2). 메시지 본문 자체(피드·스레드의 말풍선, 복사,
삭제 확인)를 그리는 `MessageRow`도 같은 규칙을 따른다: `resolveChatBlocks`가
`source: 'field'`를 돌려주면 그 자리의 `plain`은 `blocksToPlainText(blocks)`가 아니라
`content`다 — 접으면 서버가 만든 요약을 버리고 이 절이 막 설명한 블록 평문화 규칙(원문 JSON
비포함 등)을 다시 적용하게 된다.

## 7. 최소 예시

```json
{
    "blocks": [
        { "type": "header", "text": { "type": "plain_text", "text": "Error report" } },
        { "type": "divider" },
        {
            "type": "section",
            "text": { "type": "mrkdwn", "text": "*403 NOT ALLOWED* — denied by policy `channel.get`" }
        },
        {
            "type": "section",
            "fields": [
                { "type": "mrkdwn", "text": "*Service*\nchatic-sockets-api" },
                { "type": "mrkdwn", "text": "*Stage*\nlemon-production" }
            ]
        },
        { "type": "context", "elements": [{ "type": "mrkdwn", "text": "reported by <@U8171e05>" }] }
    ]
}
```

## 8. 확정되지 않은 것

**이 규격의 유일한 미검증 지점은 서버가 실제로 originate 하는 형태다.** 클라이언트 경로는
서버 왕복까지 끝냈지만, 지금의 테스트 픽스처는 Slack 공식 스키마에서 손으로 뜬 것이다.

부탁드릴 것:

1. 실제로 보내실 **블록 타입 목록**
2. **샘플 payload 하나** — 이걸로 `libs/block-kit/src/blockKit.spec.ts`의
   픽스처를 고정한다
3. `image`가 필요하신지 여부 — 필요하면 지원 추가한다

## 9. 적용 범위

**두 클라이언트 모두 그린다.** desktop-web과 `apps/web`(모바일)이 `libs/block-kit`의 같은
타입·파서·렌더러(`BlockKitMessage`)를 쓴다 — 렌더러를 플랫폼별로 다시 만들지 않는 이유는
블록킷 빌더의 프리뷰가 실제 메시지와 어긋나는 것을 막기 위해서다(`libs/block-kit/src/index.ts`).
플랫폼이 다른 것은 **Tailwind 토큰 값**뿐이다: 두 앱이 같은 이름의 스케일을 각자의 config에
정의하고, 렌더러는 이름만 부른다(모바일 `body`는 16px, desktop은 15px — 각 앱의 본문 크기).

모바일의 표현이 desktop과 다른 지점 하나: desktop은 메시지 행이 전폭이라 블록을 그 자리에
그리지만, `apps/web`은 말풍선 UI라 블록 메시지가 말풍선을 벗어나 **전폭 카드**로 그려진다
(390px에서 말풍선 폭 상한 75%는 헤더·필드 그리드가 들어갈 자리가 못 된다).

`blocks$` 필드도 두 앱이 같이 읽는다 — 읽기 우선순위가 `libs/block-kit/src/resolveChatBlocks.ts`
하나에 있다. 서버 계약(knowledge#319 SPEC.md §6-10)은 이 필드의 대상에서 모바일을 뺀 상태이므로,
모바일이 실제로 받는 것은 지금은 `content` 경로뿐이다.

서버 쪽 계약(모델·변환 템플릿·API 변경 범위)의 정본은 이 문서가 아니라
`lemoncloud-io/knowledge#319`
`projects/@lemoncloud-io/chatic-socials-api/webhook-message-blocks/SPEC.md`다. 이 문서는
그 §6(dou-app 핸드오프)을 desktop-web 구현 관점에서 반복하지 않고 가리킨다 — 서버 계약이
바뀌면 SPEC.md가 먼저 바뀌고 이 문서가 뒤따른다.
