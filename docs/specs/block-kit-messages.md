# Block Kit 메시지 — 서버 ↔ desktop-web 수신 규격 v1

작성: 2026-08-14 · 브랜치 `feat/desktop-web-block-kit` · PR #422
대상: chatic-socials-api / webhook 발신 측
클라이언트 구현: `apps/desktop-web/src/app/shared/utils/blockKit.ts`,
`apps/desktop-web/src/app/features/chat/blocks/`

## 1. 무엇을 하려는 것인가

에러 리포트나 배포 알림처럼 **구조가 있는 메시지**를 평문 한 덩어리가 아니라 제목·구분선·
필드 표로 보여주려 한다. 자체 포맷을 새로 정의하는 대신 Slack Block Kit의 부분집합을 그대로
쓰기로 했다 — 발신 측이 이미 아는 스키마이고, 클라이언트에 표시 규칙이 이미 문서화되어 있다.

이 문서는 **서버가 무엇을 보내면 되는가**만 다룬다. 렌더링 구현은 위 경로에 있다.

## 2. 전달 방법

`chat.content`에 JSON 문자열을 그대로 넣는다. **별도 필드도, 스키마 변경도 없다.**

| 항목          | 규칙                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| `content`     | `{"blocks":[...]}` 형태의 JSON 문자열. 최상위는 객체, `blocks`는 배열            |
| `contentType` | **보지 않는다.** `text`로 보내도 무관하니 맞출 필요 없다                         |
| `stereo`      | **반드시 `user`.** `system`이면 시스템 알림 렌더러를 타서 블록이 그려지지 않는다 |

판정은 마커가 아니라 내용으로 한다: `content.trim()`이 `{`로 시작하고, 파싱한 결과가
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

| 상황                           | 결과                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| 일부 블록만 미지원             | 아는 블록은 그리고, 그 자리에만 원문 JSON을 라벨과 함께 표시    |
| 전부 미지원                    | 원문 문자열 전체를 평문 메시지로 표시 (JSON 조각을 쌓지 않는다) |
| JSON 파싱 실패 · `blocks` 없음 | 원문 문자열을 평문 메시지로 표시                                |
| 기존 평문 메시지               | 영향 없음                                                       |

크래시도, 빈 말풍선도 발생하지 않는다.

`actions`(버튼)를 뺀 것은 의도적이다 — 버튼을 눌러 되돌려 보낼 interactivity 엔드포인트가
이 앱에 없다. 누를 수 없는 버튼을 그리면 거짓말이 된다.

## 6. 한 줄로 접히는 표면

사이드바 프리뷰 · OS 알림 · 검색 결과 · 클립보드 복사 · 삭제 확인 다이얼로그는 블록에서
평문을 뽑아 한 줄로 접어 보여준다. 규칙:

- 블록 순서대로 텍스트를 이어붙이고 블록 사이는 개행으로 구분한다.
- mrkdwn 마크는 제거된다. `<url|라벨>`은 라벨만 남는다.
- **미지원 블록의 원문 JSON은 여기에 포함되지 않는다** (다른 블록에 텍스트가 있는 한).

따라서 **첫 `header` 또는 첫 `section`에 요약이 오도록** 배치해 주면 프리뷰가 읽을 만해진다.

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
2. **샘플 payload 하나** — 이걸로 `apps/desktop-web/src/app/shared/utils/blockKit.spec.ts`의
   픽스처를 고정한다
3. `image`가 필요하신지 여부 — 필요하면 지원 추가한다

## 9. 적용 범위

desktop-web 전용이다. `apps/web`(모바일)은 아직 이 렌더러가 없어 블록 메시지가 오면 원문
JSON을 그대로 보여준다. 모바일에도 필요해지면 타입과 파서를 `libs/`로 올려 공유한다.
