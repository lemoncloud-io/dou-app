# ADR-0048: 안 읽음 수는 `chatNo − metaNo` 스케일에서 파생한다 — 클라이언트 세 개의 공통 계약

> 상태: Accepted · 결정일: 2026-08-10
> 관련: [ADR-0045](./0045-web-emoji-reaction-and-thread.md) (이모지 리액션·스레드 도입) · [ADR-0047](./0047-web-reaction-and-thread-refinements.md) (리액션·스레드 후속)

## 맥락 (Context)

이모지 리액션이 들어오면서 안 읽음 뱃지가 조용히 틀리기 시작했다. 다 읽은 채널에 누가 반응만
달아도 사이드바와 플레이스 레일에 숫자가 붙는다. 원인은 뱃지 코드의 실수가 아니라, **서버가
이미 갖고 있는 구분을 클라이언트가 각자 다시 유도하다가 갈라진 것**이다.

같은 값을 세 클라이언트가 각각 계산한다. 표현은 플랫폼마다 다시 만들지만 이 계산은 표현이
아니라 계약인데, 계약이 어디에도 적혀 있지 않아 세 구현이 서로 다른 전제 위에 서 있었다.
이 문서가 그 계약의 정본이다.

### 서버가 이미 하고 있는 구분

채널마다 `chatNo`라는 단조 증가 번호가 **하나** 있고, 사람이 쓴 메시지와 시스템 이벤트가 같은
시퀀스를 나눠 쓴다. 서버는 챗을 쓸 때마다 집계 대상인지 판정해 카운터를 함께 올린다.

```ts
// chatic-socials-api  src/modules/chats/proxy.ts:327
/** unread 집계 대상 메시지인지 — 현재는 user 메시지만 집계(system 등은 metaNo로 분리) */
public isCountable(stereo?: ChatStereo): boolean {
    return stereo === 'user';
}

// 같은 파일 :357 — user가 아니면 chatNo와 metaNo를 함께 올린다
const $next = this.isCountable(model?.stereo) ? { chatNo: 1, metaNo: 0 } : { chatNo: 1, metaNo: 1 };
```

여기서 이 문서 전체가 의존하는 불변조건이 나온다.

> **`chatNo − metaNo` = 그 지점까지의 사용자 메시지 개수.**
> 시스템 챗은 두 값을 함께 올리므로 이 차이에 기여하지 않는다 — 즉 시스템 이벤트에 **불변**이다.

읽음 커서에도 같은 환산이 필요하다. `join.chatNo`는 **통합 시퀀스 위의 위치**이지 사용자 메시지
개수가 아니기 때문이다. 그래서 서버는 읽음 처리 시점의 `channel.metaNo`를 `join.metaNo`로
스냅샷해 둔다. 서버 자신의 계산이 정본이다.

```ts
// chatic-socials-api  src/modules/chats/proxy.ts:155
public calcUnreadCount($channel: ChannelModel, $join?: JoinModel): number {
    if (!$join) return 0;
    const metaNo = $T.N($channel?.metaNo, 0);
    const total = $T.N($channel?.chatNo, 0) - metaNo;
    const readNo = Math.max($T.N($join.chatNo, 0), $T.N($join.joinedNo, 0));
    const readMetaNo = $join.metaNo !== undefined ? $T.N($join.metaNo, 0) : metaNo;
    return Math.max(0, total - (readNo - readMetaNo));
}
```

### 리액션이 왜 이걸 건드렸나

리액션은 필드가 아니라 **챗 레코드**다 — `stereo: 'system'`, `subType: 'reaction'`
(`chatic-socials-api` `src/lib/chats/set-reaction.ts`). 즉 `chatNo` 한 칸을 차지한다. UI에
칩으로 보이는 것은 클라이언트가 `foldReactions`로 접어 그린 결과일 뿐이다.

join/leave도 같은 방식으로 슬롯을 먹지만 드물어서 눈에 안 띄었다. 리액션은 자주 일어나므로
같은 결함을 매일 드러냈다.

### 왜 서버의 `channel.unreadCount`를 그냥 안 쓰나

두 가지 이유로 못 쓴다. 첫째, 백엔드가 최종 일관성이라 쓰기 직후 읽으면 낡은 값이 온다
(`CLAUDE.md`의 mutation cache rule과 같은 이유). 둘째, 서버는 **보낸 사람의 읽음 커서를
자동으로 전진시키지 않는다** — 방금 내가 쓴 메시지가 나에게 안 읽음으로 잡힌다. 그래서
클라이언트가 파생한다. 서버 값은 읽음 경계를 아직 하나도 모를 때의 폴백으로만 쓴다.

## 결정 (Decision)

**안 읽음 수는 양변을 사용자 메시지 스케일로 환산한 뒤 뺀다.**

```
unread = (channel.chatNo − channel.metaNo) − (join.chatNo − join.metaNo)
```

지켜야 할 규칙 네 가지.

### 1. 머리와 `metaNo`는 같은 레코드에서 읽는다

`channel.chatNo`와 `channel.metaNo`는 한 스냅샷의 두 필드다. 머리를 `lastChat$.chatNo`에서
가져오면 **다른 시점의 스냅샷**이 되고, 거기서 이 레코드의 `metaNo`를 빼면 시퀀스의 다른
지점에서 잰 시스템 개수를 빼게 된다. 커서 쪽도 같다 — `join.chatNo`와 `join.metaNo`는 반드시
같은 join 행에서 나와야 한다.

### 2. 커서 스냅샷이 없으면 예전 계산으로 degrade한다

서버가 `join.metaNo`를 남기기 전에 쓰인 행에는 그 값이 없다. 그때는 `channel.metaNo`를 대신
써서 보정을 0으로 만든다 — 결과는 예전의 슬롯 차이와 같고, 그 채널을 한 번 읽으면 서버가
스냅샷을 채우며 스스로 교정된다. 서버의 `calcUnreadCount`가 하는 것과 같은 폴백이다.

> **재검토 노트 (2026-08-18) — `apps/web`은 이 폴백을 쓰지 않는다.** "결과는 예전의 슬롯 차이와
> 같다"가 바로 문제였다. 슬롯 차이는 읽은 뒤 달린 **시스템 챗을 전부 안 읽은 메시지로 센다.**
> 리액션이 하나 달릴 때마다 뱃지가 1씩 오르고, 방을 다시 읽어 커서를 머리까지 올려도 다음
> 리액션이 곧바로 되돌린다 — 이 문서가 리액션 때문에 쓰였는데, 폴백 경로에 같은 결함이 그대로
> 남아 있었다. `channel.metaNo`는 **커서가 아니라 지금 머리의** 시스템 개수이므로 규칙 1(머리와
> `metaNo`는 같은 레코드에서)을 폴백 안에서 스스로 어긴다.
>
> `apps/web/src/app/utils/countUnread.ts`는 스냅샷이 없으면 커서를 **환산하지 않고 그대로 뺀다**
> (`userHead - readNo`). 대가는 `join.metaNo`만큼의 과소 집계이고, 그 방향은 이 문서가 이미
> "눈에 잘 안 띈다"고 적어 둔 쪽이다. 두 경우 모두 그 방을 한 번 읽으면 서버가 스냅샷을 채우며
> 정확해진다 — 차이는 그때까지 뱃지가 **올라가느냐 내려가느냐**뿐이다.

### 3. "내 메시지가 최신이면 0" 지름길은 **사용자 메시지에만** 건다

보낸 사람의 커서가 전진하지 않는 문제를 가리려고 이 지름길이 있다. 그런데 내가 남긴
*리액션*도 채널의 최신 챗이 된다. 게이트 없이 두면 읽지도 않은 채널에 👍 하나만 눌러도 뱃지가
통째로 사라진다. 판정은 이미 있는 것을 쓴다 — `isNotifiableChat`(= `stereo !== 'system'`),
OS 배너와 사이드바 미리보기가 쓰는 바로 그 술어다.

> **주의** — 이 지름길과 `metaNo` 네팅은 "이 챗이 세어야 하는가"라는 같은 질문에 서로 다른
> 메커니즘으로 답한다. 하나는 `stereo`에 대한 클라이언트 술어, 하나는 서버 카운터다. 서버의
> 비집계 집합이 정확히 `stereo === 'user'`의 여집합인 동안에만 둘이 일치한다. 그 집합이
> 넓어지면 **조용히** 어긋난다.

### 4. 로컬 읽음 커서는 경쟁하는 경계가 아니라 상한이다

서버 커서는 왕복이 있어 늦으므로 이 기기가 읽은 지점을 따로 들 수 있다. 그 값에는
`metaNo` 스냅샷이 없어 스케일이 안 맞으므로, 서버 커서와 나란히 놓고 "더 멀리 읽은 쪽"을
고르면 안 된다. 대신 상한으로 쓴다 — "`localReadNo`까지 읽었으니 그 위의 슬롯 수보다 많이 안
읽었을 수는 없다". 이래야 채널을 읽은 직후 메시지 하나가 왔을 때 밀린 개수가 통째로 다시 뜨지
않는다.

## 현재 구현 (Current state)

| 표면               | 파일                                                  | 계약 준수                                                         |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------- |
| 서버 (정본)        | `chatic-socials-api` `src/modules/chats/proxy.ts:155` | 기준                                                              |
| `apps/desktop-web` | `src/app/shared/utils/channelUnread.ts`               | ✅ 규칙 1~4 전부                                                  |
| `apps/testbed`     | `src/app/features/unread/computeUnreads.ts`           | ⚠️ 네팅은 맞으나 머리를 `lastChat$.chatNo`에서 가져와 규칙 1 위반 |
| `apps/web`         | `src/app/utils/countUnread.ts`                        | ✅ 규칙 1·2 (2026-08-18: 커서 환산 반영, 규칙 2는 위 재검토 노트) |

`apps/desktop-web`만 규칙 3·4를 갖는다. 서버 `unreadCount` 폴백과 로컬 커서 상한도 데스크톱
전용이다 — 모바일에는 둘 다 없다.

### 알려진 불일치: `apps/web`이 커서를 환산하지 않는다

`apps/web`은 머리만 환산하고 커서는 통합 시퀀스 값을 그대로 뺀다.

```ts
// apps/web/src/app/utils/countUnread.ts
/** My read cursor on the user-message scale, or undefined when no join row is known yet. */
readNo?: number;
...
const userHead = Math.max(0, (headChatNo ?? 0) - (headMetaNo ?? 0));
return Math.max(0, userHead - readNo);

// 그 readNo의 출처 — 두 값 모두 통합 스케일이다
export const readCursorOf = (join?: { readNo?: number; chatNo?: number }): number | undefined =>
    join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : undefined;
```

`join.chatNo`가 사용자 메시지 스케일이라는 전제 위에 서 있고, 그 전제가 `useChannelUnreads`의
주석에 "이러면 per-cursor metaNo 없이도 시스템 메시지가 netting된다"라고 명시돼 있다. 서버는
그렇게 보지 않는다 — `markAsRead`가 커서 슬롯의 `metaNo`를 굳이 스냅샷하는 이유가 바로
`join.chatNo`가 통합 스케일이기 때문이다. API 응답의 `readNo`도 `$join.chatNo`를 그대로 담는다
(`chatic-socials-api` `src/modules/chats/api-chats.ts:102`).

결과적으로 `join.metaNo`만큼 과잉 차감된다. 방향이 **항상 과소 집계**라서(뱃지가 실제보다 작게
나오거나 아예 안 뜬다) 눈에 잘 안 띈다. 리액션 버그가 과대 집계로 시끄러웠던 것과 대칭이다.

미수정으로 남긴 이유: 데스크톱 리액션 수정(PR #418) 범위 밖이고, 고치면 모바일 뱃지 숫자가
바뀌는 동작 변경이라 별건으로 다뤄야 한다.

### `apps/testbed`의 머리 선택

`computeUnreads`는 `latestChatNo = lastChat$.chatNo ?? channel.chatNo`로 머리를 잡으면서
`latestMeta`는 `channel.metaNo`에서 가져온다. 두 값이 다른 스냅샷일 때 규칙 1을 어긴다.
진단용 표면이라 실사용 영향은 없지만, 여기서 읽은 숫자를 다른 화면과 대조할 때 오해를 만든다.

## 결과 (Consequences)

- **좋아지는 것** — 계약이 한 곳에 적혔다. 새 표면을 만들 때 "이미 있는 세 구현 중 어느 걸
  베낄까"가 아니라 이 문서를 본다. 리액션 외에 어떤 시스템 챗이 추가돼도 뱃지는 자동으로 옳다.
- **비용** — 계산이 네 곳에 복제돼 있다. 공유 라이브러리로 빼는 것이 옳지만 마땅한 집이 없고
  (`libs/socket-data`는 `src` 없이 dist만 남은 죽은 패키지), 위의 web/desktop 불일치를 먼저
  정리하지 않으면 틀린 전제를 엔진에 굳히게 된다. **불일치 해소가 추출의 선행 조건이다.**
- **타입 지연** — 발행된 `@lemoncloud/chatic-socials-api`가 `join.metaNo`와
  `ChatSubType.reaction`을 아직 선언하지 않는다(설치 `0.26.412`, 서버 `0.26.722`). 클라이언트는
  좁은 캐스트로 읽는다. 캐시 경로는 `libs/app-messages`의 `CacheJoinView`를 넓혀 정리했지만
  `ChannelView.$join`에서 오는 자리는 캐스트가 남아 있다. SDK가 따라오면 그 자리들을 찾아야
  한다.

## 후속 (Follow-ups)

- [ ] `apps/web`의 커서 환산 수정 — 위 "알려진 불일치". 동작 변경이라 별도 PR.
- [ ] `apps/testbed`의 머리/`metaNo` 레코드 일치 (규칙 1).
- [ ] 위 둘이 정리된 뒤 공유 파생 함수 추출 위치 결정.
- [ ] SDK 업그레이드 시 `join.metaNo` 캐스트 제거.
