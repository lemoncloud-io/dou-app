# channels — 시스템 메시지 (입퇴장)

> 대상: `apps/web/src/app/features/channels` · 참조 구현: `apps/testbed/src/app/pages/ChatRoomPage.tsx`
> 서버 스펙: `chatic-socials-api/docs/specs/chat-system-message` · 프론트 전체: [docs/specs/chat-system-message.frontend.md](../../../../../docs/specs/chat-system-message.frontend.md)

채팅방에 멤버가 입장/퇴장하면 채널에 **시스템 메시지**가 한 건 남는다. 이 문서는 그 메시지를 web 채널 화면이 어떻게 모델링·렌더·집계하는지 정리한다.

## 핵심

- 시스템 메시지는 `stereo: 'system'` + `subType: 'join' | 'leave'`로 구분되고 **content는 비어 있다**.
- 서버는 자연어 문장을 저장하지 않는다 → **클라이언트가 `subType` 코드 + 당사자 이름으로 i18n 렌더**한다 (Slack subtype 패턴).
- 시스템 메시지도 `chatNo`를 증가시켜 히스토리에 남지만, **안읽은 수에는 포함하지 않는다**.

## 모델링

서버 패키지(`@lemoncloud/chatic-socials-api`)가 스펙을 반영하면서 `ChatView`/`ChannelView`에 필드가 추가됐고, 도메인 타입이 상속으로 이를 **자동 포함**한다 — 로컬 타입 확장은 없다.

| 타입                   | 필드                                      | 의미                                                                            |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `DomainChat.stereo`    | `'' \| 'user' \| 'system'`                | `system`이면 시스템 메시지                                                      |
| `DomainChat.subType`   | `'' \| 'join' \| 'leave'` (`ChatSubType`) | 입장/퇴장 구분 코드                                                             |
| `DomainChannel.metaNo` | `number?`                                 | 비집계 이벤트 누적(`chatNo − metaNo` = 사용자 메시지 수). **현재 미사용(후속)** |

`ChatSubType`은 `@chatic/data`에서 re-export하므로 앱은 `import type { ChatSubType } from '@chatic/data'`로 쓴다.

> ⚠️ **모델링 전환점.** 과거엔 시스템 메시지를 `content`의 한글 정규식(`/^(.+?)(님이.+)$/`)으로 렌더했다. content가 비어 오는 신규 모델에서는 깨지므로 **subType 기반 렌더로 전환**했다. 정규식 경로는 legacy fallback으로만 남는다.

## 렌더

### 판별

`useChats`가 `DomainChat` → `ClientChatView` 매핑 시 `isSystem = stereo === 'system'`을 노출한다([data-layer.md](./data-layer.md) §메시지). 시스템 메시지는 `isSameGroup`에서 제외되어 일반 메시지와 묶이지 않는다.

### subType → i18n

`utils/systemMessage.ts`의 `systemMessageSuffixKey()`가 subType을 i18n 키로 매핑한다.

```
join  → 'chat.room.system.join'
leave → 'chat.room.system.leave'
그 외 → null   # legacy content fallback 허용
```

키는 **suffix 절**만 담는다. 당사자 이름은 별도로 굵게 prefix 렌더한다 → ko/en 모두 자연스럽다.

| locale | `system.join`           | 렌더 결과                    |
| ------ | ----------------------- | ---------------------------- |
| ko     | `"님이 들어왔습니다"`   | **앨리스**님이 들어왔습니다  |
| en     | `" joined the channel"` | **Alice** joined the channel |

이름은 site profile nick 우선(`profileMap.get(ownerId)?.nick`), 없으면 `message.ownerName`.

### `ChannelRoomPage`의 분기

```tsx
if (message.isSystem) {
    const suffixKey = systemMessageSuffixKey(message.subType);
    if (suffixKey) {
        // 가운데 정렬 pill: <b>{nick ?? ownerName}</b> + t(suffixKey)
    }
    // suffixKey === null → legacy: content 정규식(님이…) 렌더
}
```

`subType`이 비었거나 미상이면 `null`을 받아 기존 content 렌더로 폴백한다(과거 데이터 호환).

## 안읽은 수 (룸 페이지 한정)

요구사항: **안읽은 수는 사용자 메시지만 센다.** 이번 범위는 룸 페이지의 per-message 표시다.

- 시스템 메시지는 렌더 분기에서 일찍 반환되어 `ReadStatus`(읽음/안읽음 수)를 **그리지 않는다**.
- `useJoinPositions.getReadCount`는 chatNo 커서 기반이라 별도 필터가 없어도 시스템 버블엔 표시되지 않는다.

> 채널 **목록의 안읽음 뱃지**(홈)는 `home/lib/computeUnreads.ts`에서 `metaNo`로 보정해 시스템 메시지를 제외한다 — `unread = max(0, (latest − readNo) − (latestMeta − readMeta))`. 읽음 커서 metaNo(`join.metaNo`)가 아직 없으면 기존 동작으로 안전 degrade. 상세는 프론트 스펙 §4.

## 발행 경로 (참고)

시스템 메시지 **생성은 서버 책임**이다. join 레코드의 `joined` 0↔N 전이를 스트림 핸들러가 감지해 `POST /chats/0/send`(`stereo:'system'`)로 자기 위임한다. web 채널 화면은 생성에 관여하지 않고 **수신·렌더만** 한다.

testbed에는 이 흐름을 수동으로 트리거하는 전송 도구가 있다(`features/system-message/`) — 소켓 `chat.send`가 `stereo/subType`을 지원하므로 사용자 메시지와 동일하게 `repos.chat.sendChat({ content:'', stereo:'system', subType })`로 보낸다(owner는 현재 소켓 사용자). 상세는 프론트 스펙 문서 §5 참조.

## 관련 파일

| 파일                                      | 역할                                         |
| ----------------------------------------- | -------------------------------------------- |
| `utils/systemMessage.ts`                  | `systemMessageSuffixKey` (subType → i18n 키) |
| `hooks/useChats.ts`                       | `isSystem` 매핑                              |
| `pages/ChannelRoomPage.tsx`               | 시스템 메시지 렌더 분기 (+legacy fallback)   |
| `public/locales/{ko,en}/translation.json` | `chat.room.system.join/leave`                |

## 테스트

```sh
npx jest --config apps/web/jest.config.js --runInBand --watchman=false \
  apps/web/src/app/features/channels
```

`utils/systemMessage.test.ts`가 subType→키 매핑과 빈/미상 fallback을 고정한다.
