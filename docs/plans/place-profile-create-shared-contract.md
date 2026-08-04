# 플레이스 프로필 생성 — 두 세션 공유 인터페이스 계약

> 작성 2026-08-03 · 근거: [ADR-0040](../adr/0040-self-chat-title-and-profile-setup-nudge.md) · [ADR-0041](../adr/0041-place-profile-as-invite-precondition.md)

같은 날 쓰인 두 ADR이 **같은 파일 셋을 만진다.** 병렬로 진행하려면 아래 시그니처를 먼저 고정하고,
각자 자기 소유 파일만 수정한다. 이 문서가 두 세션의 유일한 접촉면이다.

| 세션     | ADR      | 하는 일                                                |
| -------- | -------- | ------------------------------------------------------ |
| **S-40** | ADR-0040 | self 표시 이름 확정 + 방 설정에서의 프로필 미설정 유도 |
| **S-41** | ADR-0041 | 초대 경로(초대자·피초대자) 프로필을 전제조건으로 복원  |

### ⚠️ 두 세션이 워킹 트리를 공유한다

워크트리 분리가 **아니다.** 둘 다 `claude/1-1-chat-auth-social-roadmap-0e4b17` 브랜치의 같은
디렉터리에서 작업한다(2026-08-03 기준 S-40이 `apps/web/docs/feature/home/place-profile-prompt.md`를
그 트리에서 재작성 중인 것으로 확인). 그래서 **머지 충돌이라는 안전망이 없다** — 같은 파일을 동시에
만지면 조용히 서로를 덮어쓴다. §5의 소유권 표가 관례가 아니라 유일한 방어선이다.

각자 파일을 열기 전에 `git status --short`로 상대가 이미 만진 파일인지 확인한다. 소유권 표에 없는
파일이 dirty하면 상대 작업이므로 만지지 않는다.

착수 시점에 공유 심볼은 둘 다 미존재였다 — `resolvePlaceDisplayName` 없음,
`PlaceProfileCreateDialog` 없음(orphan 워크트리
`.claude/worktrees/place-settings-feature-4cf838`에 삭제 전 사본만 남아 있음).

---

## 1. `PlaceProfileCreateDialog` — S-40 생성, S-41 소비

`98a4685ff`가 지운 원본이
`.claude/worktrees/place-settings-feature-4cf838/apps/web/src/app/features/home/components/PlaceProfileCreateDialog.tsx`에
남아 있다. **그 시그니처를 그대로 되살리고 `exit` 관련만 바꾼다.**

```ts
// apps/web/src/app/features/home/components/PlaceProfileCreateDialog.tsx  (S-40 소유)
interface PlaceProfileCreateDialogProps {
    /** Controls visibility (owned by the caller). */
    open: boolean;
    /** Place display name interpolated into the title. Callers pass the RESOLVED name (§2). */
    placeName: string;
    /** Called after the profile is created successfully. */
    onDone: () => void;
    /** Called when the user leaves without creating a profile. */
    onExit: () => void;
    /**
     * Unsaved-changes guard copy. OMIT to exit immediately on X (§3) — the invite paths do,
     * so a user who backs out is simply not inviting/accepting.
     */
    exit?: PlaceProfileExitCopy;
}
```

- 원본과의 차이는 **`dismissible` 제거, `exit` 추가**뿐이다. `dismissible`은 두 ADR 모두 `false`로
  쓰지 않기로 했으므로(ADR-0041 결정 2 / ADR-0040 결정 5) 노출하지 않는다. 필요해지면 그때 넣는다.
- 나머지 카피는 원본대로 `placeProfileCreate.*` 전부, `onSubmit`은
  `profileRepository.setMyProfile({ nick, thumbnail })`.
- **S-41은 이 파일을 수정하지 않는다.** 초대 경로가 필요한 것은 `exit`를 넘기지 않는 것뿐이다.

호출 형태:

| 호출자                                        | 소유 | `exit`             | `onExit` 목적지             |
| --------------------------------------------- | ---- | ------------------ | --------------------------- |
| `ChannelSettingsPage` (내 행 클릭)            | S-40 | 넘긴다 (가드 유지) | 다이얼로그 닫기             |
| `ContactInvitePage`                           | S-41 | **생략**           | 홈으로 navigate (`replace`) |
| `RelayInviteAccept` (`phase === 'profiling'`) | S-41 | **생략**           | `flow.cancelStep`           |

> **구현 결과 (2026-08-03)** — S-41이 배선을 마쳤다. 계획에 있던 중간 래퍼
> `RelayInviteProfileDialog`와 `useSaveMyPlaceProfile`은 **만들지 않았다**: 이 다이얼로그가 카피와
> `setMyProfile` 저장을 전부 소유하므로 래퍼에 남는 것이 `placeName` 한 줄뿐이었다. 두 호출자 모두
> 이 컴포넌트를 직접 렌더한다.
>
> ⚠️ **배럴로 import하면 jest가 깨진다.** 이 파일은 `@chatic/app-runtime`을 import하고 그 config
> 배럴을 jest가 파싱하지 못해서, `features/home/components` 배럴 경유 import는 소비 스위트를
> `Jest failed to parse a file`로 죽인다. **직접 파일 경로로 import**하고 테스트에서는 스텁한다
> (`PlaceProfileForm.tsx:9-12`가 같은 함정을 이미 경고해 뒀다). S-40의 `ChannelSettingsPage`
> 배선도 같은 제약을 받는다.

---

## 2. `resolvePlaceDisplayName` — S-40 생성, S-41 소비

ADR-0040 결정 7. **순수 함수**로 두고 훅에서 감싼다 — 그래야 `PlaceItem`(place 객체를 가진 목록 행)과
`useActivePlaceName`(sid만 가진 훅)이 같은 규칙을 공유한다.

```ts
// S-40 소유. 배치는 S-40 재량(apps/web/src/app/features/home/lib/ 또는 app/utils/)
export const resolvePlaceDisplayName = (
    place: Pick<DomainPlace, 'id' | 'name'> | null | undefined,
    ctx: { isDefaultCloud: boolean },
    t: TFunction
): string => {
    /* 홈 플레이스면 t('placeList.defaultPlace'), else place?.name ?? '' */
};
```

판정은 ADR-0040 결정 7대로 **`ctx.isDefaultCloud` OR `place.id === '0000'`** (OR). S-41의 초안은
클라우드 문맥 단독이었으나 S-40이 `'0000'`이 실재 sid라는 증거를 찾았으므로 **S-40을 정본으로 따른다**.

`useActivePlaceName()`은 반환 타입(`string`)을 바꾸지 않고 내부에서 이 함수를 적용한다. S-41은
`useActivePlaceName()`을 **호출만** 하므로, 이 변경이 내리는 순간 초대 경로의 제목이 자동으로
`<두유 홈>...`이 된다. **S-41은 `useActivePlaceName.ts`를 수정하지 않는다.**

---

## 3. `PlaceProfileForm.exit`를 optional로 — S-41 소유, S-40 영향 받음

**S-41이 만지는 유일한 공유 파일이다.** ADR-0041 결정 2가 "X는 이탈 모달 없이 곧바로 이전 화면으로"를
요구하므로 가드를 끌 수단이 필요하다.

`confirmOnExit?: boolean` 같은 별도 boolean을 두지 않는다. **`exit`의 부재 자체를 스위치로 쓴다.**

```ts
// apps/web/src/app/features/home/components/PlaceProfileForm.tsx  (S-41 소유)
export interface PlaceProfileFormProps {
    // ...
    /**
     * Confirm-on-exit copy. When omitted, X / esc / overlay / back exit immediately without a
     * guard — the invite paths (ADR-0041) do that, since backing out there means the invite was
     * never sent or accepted. Supply it to keep the guard (the edit flows do).
     */
    exit?: PlaceProfileExitCopy; // was: required
}
```

동작 변경은 `requestClose`에 한 줄이다.

```ts
const requestClose = () => {
    if (submitting) return;
    if (exit && isDirty)
        setAlertOpen(true); // was: if (isDirty)
    else onExit();
};
```

`exitGuard`는 `exit &&`로 감싸 렌더한다. `dismissible` 분기는 손대지 않는다.

**S-40이 알아야 할 것 두 개**

1. `exit`를 넘기는 기존 두 호출자(`PlaceProfileEditDialog`, `PlaceProfilePage`)는 **변경 없이 그대로
   동작한다.** 편집 플로우의 가드는 유지된다 — 되돌릴 기존 값이 실재하는 자리이므로 의도된 것이다.
2. ADR-0040 결정 6의 `placeProfileCreate.exitDescription` 재작성은 **여전히 필요하다.** S-40의 유도
   경로(방 설정 → 내 행)는 `exit`를 넘기므로 그 문구가 실제로 보인다. 현재 값
   `"이름을 설정해야 DoU를 시작할 수 있어요!"`는 프로필 강제가 0인 지금 거짓이다.

---

## 4. ⚠️ 두 ADR이 이름 붙이지 않은 세 번째 접촉면 — "내 프로필 nick이 없다"의 판정

**두 세션이 같은 사실을 서로 다른 경로로 읽는다.** 어느 ADR도 이걸 명시하지 않았다.

|                            | 읽는 곳                                                                                                                                                             | 출처                                                                                                                       | 실패 방향                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **S-40** (결정 4·5)        | `profileMap.get(memberId)?.nick`, `memberId === userId` ([ChannelSettingsPage.tsx:209](../../apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx:209)) | `useChannelProfiles(sid, activeMemberIds)` — 반응형, 5초 주기 sync                                                         | 유도 문구가 한 박자 깜빡임  |
| **S-41** (ADR-0041 결정 5) | `isPlaceProfileAbsent(reader)` — `await getMyProfile()` 단발                                                                                                        | `apps/web/src/app/utils/placeProfile.ts` (**순수 함수**) + `app/hooks/usePlaceProfileAbsent.ts`(`{ absent, markPresent }`) | fail open → 게이트를 건너뜀 |

**합치지 않는다.** 두 경로의 요구가 다르다.

- S-40은 **이미 열린 채널 화면**에서 멤버 목록을 그리며 내 행 하나를 판정한다. `profileMap`이 이미 그
  화면의 데이터이고, 별도 구독을 추가하는 것은 낭비다. 반응형이어야 한다 — 프로필을 만들면 그 행이
  즉시 갱신돼야 하기 때문이다.
- S-41은 **서버 호출을 할지 말지**를 판정한다. 수락 쪽은 `advance()`(async) 안에서 부르므로 훅일 수
  없고, 기다릴 수 있으므로 기다린다 — 그러면 "로딩 중"과 "없음"이 섞이는 문제가 애초에 없다.

> **개정 (2026-08-03, 스펙 작성 중)** — S-41 쪽은 원래 `usePlaceProfilePrompt`의 반응형 3상태 훅
> (`unknown`/`present`/`absent` + `settled` 게이트 + `sid` 확인)이었다. `await`로 바꾸면서 `unknown`이
> 사라졌고 `settled`·`sid` 방어도 함께 불필요해졌다(응답을 기다리므로 낙관적 sid 뒤집기에 걸리지
> 않는다). 상세: ADR-0041 결정 5의 개정 주석.

**대신 각자 다음을 지킨다.**

- **S-40**: `profileMap`이 비어 있는 것은 "nick 없음"이 아니다. `isMembersLoading` 중에는 `프로필 설정 필요`를
  렌더하지 않는다. 로딩과 부재를 구분하지 않으면 방 설정을 열 때마다 그 문구가 한 번 깜빡인다.
  (ADR-0039 조사 5 — `profileMap`은 `activeMemberIds`만 채운다.)
- **S-41**: 판정을 `features/` 안에 두지 않는다. 초대 두 경로가 공유하므로 `app/utils/placeProfile.ts`.
  훅이 아니라 순수 함수여야 한다.

두 판정이 어긋나 보이는 상황(방 설정은 `프로필 설정 필요`인데 초대 화면은 안 뜸, 또는 반대)은
**정상**이다. 전자는 즉시성을, 후자는 안전성(fail open)을 택한 결과다.

⚠️ **양쪽 공통 미검증 가정 — 아직 열려 있다**: `apps/web`에 `profile.active`를 읽는 코드가 없었고,
S-41의 판정이 그 첫 소비처다. 프로필 없는 계정의 `get-mine`이 실제로 `active === false`를 주는지
**dev 스테이지에서 확인하고 여기에 결과를 적을 것.** 안 주면 S-41의 게이트가 한 번도 뜨지 않고
(fail open — 초대·수락은 정상 동작), S-40은 영향이 없다(`nick`만 본다). 깨졌을 때의 대안은
`nick` 부재 단독 판정이며, `await`한 응답이라 덮어쓰기 위험은 없다.

**S-41 구현 완료 (2026-08-03)**: `utils/placeProfile.ts`(7 테스트) ·
`hooks/usePlaceProfileAbsent.ts`(8 테스트) · `ContactInvitePage` 게이트(+6) ·
`useRelayInviteFlow` `profiling` phase(+6) · `RelayInviteAccept` 분기(+4) ·
`PlaceProfilePage` 얼리리턴 수정. `apps/web` 140 스위트 / 1033 테스트 전부 통과.

---

## 5. 파일 소유권

동일 파일을 두 세션이 만지지 않는다. 아래 표를 벗어나는 수정이 필요해지면 먼저 상대 세션에 알린다.

**S-40 단독**

- `PlaceProfileCreateDialog.tsx` (신규) · `resolvePlaceDisplayName` (신규)
- `useActivePlaceName.ts` · `PlaceItem.tsx` · `DouHomeItem.tsx`
- `ChannelSettingsPage.tsx` · `MemberListItem` 계열
- `resolveChannelTitle.ts` · `selfChatTitle.ts` · `utils/channel.ts`(`resolveChannelName` 제거) · `useChannel.ts`
- i18n: `placeProfileCreate.title` · `placeProfileCreate.exitDescription` · `placeList.defaultPlace`(ko) · `channelList.selfChannel`(en)

**S-41 단독**

- `PlaceProfileForm.tsx` (§3)
- `ContactInvitePage.tsx` · `RelayInviteProfileDialog.tsx`(복원) · `useRelayInviteFlow.ts` · `RelayInviteAccept.tsx`
- `PlaceProfilePage.tsx` (얼리리턴 수정, ADR-0041 결정 7)
- `app/utils/placeProfile.ts`(신규 · `isPlaceProfileAbsent`) · `app/hooks/usePlaceProfileAbsent.ts`(신규) · `useSaveMyPlaceProfile.ts`(복원) · `RelayInviteProfileDialog.tsx`(복원)
- `docs/invite-accept-entry.md` · `apps/web/docs/feature/invite/relay-invite-accept.md`

**충돌 예상 — 순서로 푼다**

| 파일                                                 | 왜                                                | 처리                                                            |
| ---------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `features/home/components/index.ts`                  | 둘 다 export 추가                                 | S-40이 `PlaceProfileCreateDialog` 먼저. S-41은 추가 export 없음 |
| `apps/web/docs/feature/home/place-profile-prompt.md` | S-40이 이미 재작성 중 (`상태: Live` → `Proposed`) | **S-41은 만지지 않는다.** 아래 요청 사항만 S-40에 전달          |

**S-40의 `place-profile-prompt.md`에 필요한 보강 한 줄** — 그 문서는 범위 밖 항목에
`"초대 수락 파이프라인"`을 적고 본문에서 `"프로필은 선택이다"`의 근거로 ADR-0039의 강제 해제를
든다. 둘 다 **여전히 참이다**(ADR-0041도 X를 항상 열어두므로 강제는 0이다). 다만 그 문서만 읽은
사람은 "초대 경로에 프로필 단계가 없다"고 결론하게 되고, ADR-0041이 내리면 그건 거짓이 된다.
초대 경로는 ADR-0041 소관이라는 **상호 참조 한 줄**을 S-40이 자기 문서에 넣어주면 된다.

---

## 6. 착수 순서

> **진행 상황 (2026-08-03)** — S-40이 ①②를 완료하고 S-41의 ④까지 함께 처리했다. 확인된 것:
> `PlaceProfileCreateDialog`(§1 시그니처 일치, `exit?` 포함) · `resolvePlaceDisplayName` +
> `useActivePlaceName` 적용(§2) · `PlaceProfileForm.exit` optional(§3, 계약 문구 그대로) ·
> ko `placeList.defaultPlace` → `두유 홈` · `placeProfileCreate.exitDescription` 재작성.
> **S-41은 스텁 없이 ⑤⑥부터 시작한다.**

S-41은 §1·§2에 의존하고, S-40은 §3의 결과를 받는다. **완전 병렬은 불가능하고, 절반만 겹칠 수 있다.**

```
S-40 ─┬─ ① resolvePlaceDisplayName + useActivePlaceName        ← S-41 대기 없음
      ├─ ② PlaceProfileCreateDialog (exit optional 형태로)      ← S-41이 기다리는 것
      └─ ③ 방 설정 내 행 + 클릭 분기 + self 표시 이름           ← §3 이후

S-41 ─┬─ ④ PlaceProfileForm.exit optional (§3)                  ← 즉시 착수 가능, ③의 선행
      ├─ ⑤ isPlaceProfileAbsent + 훅                             ← 즉시 착수 가능
      └─ ⑥ 초대 두 경로 배선                                    ← ②가 내린 뒤
```

- **④를 S-41이 가장 먼저 한다.** 10줄 미만이고 S-40의 ③이 그 위에 선다.
- **②를 S-40이 ③보다 먼저 한다.** S-41의 ⑥이 막혀 있다.
- ②가 내리기 전에 ⑥을 시작하려면 `PlaceProfileCreateDialog`를 §1 시그니처 그대로 **스텁**으로
  두고 배선만 한다(ADR-0033 결정 1의 인터페이스 선반영 패턴). 스텁은 S-40이 실물로 교체한다.

## 7. ⚠️ `invite.accept` 이전 프로필 쓰기 — 전제가 절반만 맞았다

**백엔드는 되지만 클라이언트가 sid를 못 갖는 경우가 있다** (2026-08-03 코드리뷰에서 정정. 그 전 기록은
"가능하다"였고, 근거로 든 `relayCore`의 persist는 사실이지만 **누가 그 값을 쓰는지**를 빠뜨렸다).

- relay sid는 `chatic-relay-selected-site-id`의 단순 읽기이고, 쓰는 것은 명시적 플레이스 전환
  (`useSwitchPlace`, **홈에서만 마운트**)뿐이다. 인증·토큰 갱신·백그라운드 싱크 전부 sid를 세우지 않는다.
- `storage`는 일반 브라우저에서 **sessionStorage**다 ([storage.ts:13](../../libs/shared/src/utils/storage.ts:13);
  localStorage는 네이티브 WebView·데스크톱 셸만). SMS 링크를 새 탭에서 열면 **오래된 사용자도 비어 있다.**
- `/invite/accept`의 relay 분기에는 sid를 쓰는 코드가 없다(cloud 분기만 `useEnterInvitedSite`로 쓴다).

**S-41의 대응**: 판정을 sid 인식으로 만들었다 — `!sid`면 프로필 스텝을 건너뛰고 진행한다(fail open).
방치하면 다이얼로그 안에서 `setMyProfile`이 던져 초대를 **영구히 수락할 수 없게** 된다.
`usePlaceProfileAbsent`도 `!sid || !uid`에서 `undefined`(대기)가 아니라 `false`(present)로 settle한다 —
`undefined`로 두면 렌더를 붙잡은 화면이 영원히 빈 채로 남는다.

**S-40이 알아야 할 것**: 방 설정 유도(결정 4·5)는 `/place/:placeId/...` 라우트라 sid가 있는 것이
보장되므로 영향이 없다. 다만 `PlaceProfileCreateDialog`를 sid 없는 문맥에서 열면 저장이 던진다는 사실은
공유된다 — 새 호출부를 만들 때 확인할 것.

**남는 한계 (후속)**: sid 없는 진입에서는 프로필 스텝이 뜨지 않아 ADR-0041 결정 1의 보장이 그 경로에서
성립하지 않는다. 근본 해결은 수락 라우트에서 relay 플레이스를 해소해 sid를 세우는 것.
