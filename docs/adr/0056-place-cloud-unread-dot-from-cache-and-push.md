# ADR-0056: 홈 언리드 점 — 플레이스는 캐시로, 클라우드는 푸시 마크로

> 상태: Accepted · 결정일: 2026-08-14

## 맥락 (Context)

홈에서 지금 보고 있지 않은 곳에 새 메시지가 왔다는 사실을 알 수 없다.

- **비활성 플레이스**(같은 클라우드): [`HomePage.tsx:146-152`](../../apps/web/src/app/features/home/pages/HomePage.tsx)가 활성 사이트의 채널만 가져오므로 `unreadByPlace`에 키가 하나뿐이다. 주석 스스로 "a later step fills in cross-place totals a different way; other places show no dot in the meantime"이라고 예고해 둔 상태다 — 이 ADR이 그 later step이다.
- **타 클라우드**: [`CloudSessionSheet`](../../apps/web/src/app/features/home/components/CloudSessionSheet.tsx)의 점은 `useOtherCloudUnread`가 읽는 **마지막 캐시 상태**다. 소켓은 클라우드당 하나라 떠나 있는 동안 온 메시지는 캐시에 없고, 점도 없다 ([cross-cloud-push.md](../specs/cross-cloud-push.md) §1).

요구사항은 명확히 **카운트가 아니라 존재 표시**다: "푸시가 어떤 클라우드의 어떤 사이트로 도착했으면 표시만, 그 플레이스 접속 시 개수가 재갱신". 활성 플레이스는 기존대로 읽음 개수를 보여준다.

### 판단에 쓰인 사실

- 점 UI는 셋 다 이미 있다: `PlaceItem`(빨간 점, presence-only) · `CloudItem` · `InviteCloudItem`(`hasUnread`). 값이 안 갈 뿐이다.
- [`useChannelUnreads`](../../apps/web/src/app/hooks/useChannelUnreads.ts)는 이미 사이트 단위로 버킷한다(`byPlace[sid]`). 활성 플레이스만 커버되는 건 능력이 아니라 **입력**의 문제다.
- [`useActiveCloudChannels`](../../apps/web/src/app/hooks/useActiveCloudChannels.ts)가 활성 클라우드 **전 사이트**의 채널을 캐시-온리로 관찰하고, `UnreadBadgeRunner`가 이미 이것으로 앱 아이콘 뱃지를 계산한다. 크로스-플레이스 축소(커밋 `bb00a041`)의 이유는 per-channel 서버 sync 비용이었지 캐시 관찰이 아니다.
- 포그라운드 푸시는 이미 웹에 도달한다: [`useFcmHandler.ts:92-104`](../../apps/mobile/src/app/webview/hooks/useFcmHandler.ts) → `OnReceiveNotification`(페이로드 `data` 통째). 이를 점으로 바꾸는 소비자만 없다.
- **백그라운드/종료 중 푸시는 웹에 전달되지 않는다** — 네이티브가 배너·뱃지만 처리한다 ([push.md](../../apps/mobile/docs/push.md)).
- `apps/desktop-web`에 이 기능이 이미 출하돼 있다: `useCrossCloudPushBadge`(도착 시 cid 마크, 클라우드 진입 확인 시 해제) + `useCloudPushBadgeStore`(persist) + `resolvePushCloudId`(빈 `cid` 역조회, **유일 매칭일 때만** — "잘못된 점보다 없는 점"). desktop-web은 수정 금지 대상이지만 참조·포트는 무방하다.
- 네이티브 공유 저장소가 이미 있다: iOS App Group `group.io.chatic.dou`(앱·NSE 양쪽 entitlements 등록 완료, [badge.md](../../apps/mobile/docs/badge.md)) · Android [`BadgeStore.kt`](../../apps/mobile/android/app/src/main/java/io/chatic/dou/push/BadgeStore.kt)(SharedPreferences). 뱃지 +1이 일어나는 분기가 곧 마크를 기록할 자리다.
- 푸시 페이로드: `cid`는 스펙에 있으나 relay 센티널 `'#'`(ADR-0045)과 빈 문자열(배포 백엔드, [cross-cloud-push.md](../specs/cross-cloud-push.md) §0) 변형이 있다. **`sid`는 스펙에 없다** — 코드가 낙관적으로 읽을 뿐이다.
- 언더카운트 버그: `apps/web`의 unread 공식이 읽음 커서를 사용자-메시지 스케일로 변환하지 않아(ADR-0048 위반, 해당 문서에 후속 과제로 기록됨) **점이 안 뜨는 방향**으로 틀린다.

## 결정 (Decision)

### 1. 플레이스 점은 캐시로 — 푸시를 쓰지 않는다

HomePage의 `useChannelUnreads` 입력을 활성 사이트 채널에서 **활성 클라우드 전체 채널**(`useActiveCloudChannels`, 캐시-온리)로 바꾼다. `byPlace`가 모든 사이트에 채워지고 `PlaceItem`의 기존 점이 켜진다. 신선도는 기존 60초 클라우드-와이드 델타(`useBackgroundSync`) + 포그라운드 복귀가 담당한다 — **서버 요청·sync 등록 추가 0**. 점은 presence-only라 이 주기로 충분하다.

푸시를 플레이스 단위 신호로 쓰지 않는 이유: `sid`가 푸시 스펙에 없다. 스펙 밖 필드에 기능을 걸지 않는다.

활성 플레이스는 지금처럼 읽음 개수를 유지한다. "접속 시 재갱신"은 이미 시스템의 기본 동작이다(진입 → 채널·조인 sync → 캐시에서 재유도).

### 2. 클라우드 점은 푸시 마크로 — desktop-web을 포트한다

`OnReceiveNotification` 수신 시 소스 클라우드를 판별해 `Record<cloudId, true>` 마크를 기록하고(zustand + persist), 그 클라우드로 **전환이 확인된 시점**에 해제한다. 판별 규칙은 desktop-web의 `resolvePushCloudId`를 따른다:

- `cid === '#'` → relay(ADR-0045 센티널)
- `cid` 유효 → 그대로
- `cid` 빈 값 → 크로스-파티션 캐시 역조회(`$join.userId === data.uid` 우선, `channelId` 보조). **유일 매칭일 때만 마크한다** — 오탐 점이 미탐 점보다 나쁘다.
- 활성 클라우드로 온 푸시는 마크하지 않는다(소켓이 이미 처리).

점의 최종 값은 `(useOtherCloudUnread의 캐시 힌트) OR (푸시 마크)`다.

### 3. 백그라운드 도착분은 네이티브 마크로 복원한다

뱃지 +1이 일어나는 바로 그 자리 — iOS NSE `applyBadgeIncrementIfNeeded`, Android FCM 서비스의 백그라운드 분기 — 에서 `cid` 마크를 **기존 공유 저장소**(App Group UserDefaults / SharedPreferences)에 함께 기록한다. 같은 가드(chat 채널만, 포그라운드 제외, silent 제외)를 그대로 탄다. 웹이 부팅·포그라운드 복귀 시 브릿지로 읽어 웹 마크 스토어에 병합하고, 읽는 즉시 네이티브 쪽을 비운다(consume-once).

- iOS App Group은 이미 양쪽 entitlements에 있어 **프로비저닝 재작업이 없다.**
- 네이티브에서는 `cid`를 판별하지 않는다 — 원시 `cid`(빈 값·`'#'` 포함)를 그대로 저장하고, 판별은 웹의 단일 지점(결정 2의 규칙)에서만 한다. 정규화 로직을 3개 런타임에 복제하지 않는다.

### 4. 클라우드 점의 두 번째 노출 표면

홈 헤더의 클라우드 전환 버튼(AppHeader `onSwitcher`)에 점 오버레이를 추가한다. 시트는 열기 전엔 보이지 않으므로, 시트 안의 점만으로는 기능이 발견되지 않는다([cross-cloud-push.md](../specs/cross-cloud-push.md) §4 권고).

### 5. ADR-0048 언더카운트를 함께 고친다

읽음 커서를 사용자-메시지 스케일로 변환하도록 `countUnread`를 공식에 맞춘다. 점의 정확도(누락 방향)에 직결되는 기존 후속 과제라 이번 범위에 포함한다.

**포함:** apps/web(데이터 소스 교체 · 푸시 마크 스토어/훅 포트 · 스위처 트리거 점 · countUnread 수정), apps/mobile(iOS NSE·Android 서비스의 마크 기록, 마크 읽기/클리어 브릿지), 문서.

**제외(후속 작업):**

- **플레이스(sid) 단위 푸시 마크.** `sid`가 스펙에 오르면 재검토.
- **Android 포그라운드 `channelId` 클로버 버그** ([`useFcmHandler.ts:123-133`](../../apps/mobile/src/app/webview/hooks/useFcmHandler.ts)가 채팅 채널 id를 알림 채널 id로 덮어씀 — 인앱 배너 중복 억제가 안드로이드에서 무력화된 상태). 이번 기능은 `cid`/`uid`만 쓰므로 전제가 아니다. 별도 수정.
- 점 프리미티브 추출(3곳 인라인 중복) — cosmetic.
- 서버 크로스-클라우드 요약 API.

## 대안 (Alternatives)

- **서버가 크로스-클라우드 unread 요약을 제공** — 가장 정확하지만 백엔드 신규 API가 필요하고 이 트랙 범위 밖. 기각.
- **클라우드-와이드 per-channel sync 재등록**(커밋 `cb79954f` 방식 복원) — 채널 수만큼 서버 요청이 매 주기 발생해 `bb00a041`이 의도적으로 제거한 비용 문제가 되돌아온다. 점 용도에 그 신선도는 과잉. 기각.
- **푸시로 플레이스 점까지 구동** — `sid`가 푸시 스펙에 없어 미문서 필드 의존이 된다. 캐시 경로가 이미 sid 해상도를 가지므로 불필요. 기각.
- **백그라운드 한계 수용(네이티브 마크 없음)** — 웹만으로 끝나 가장 저렴하지만, 사용자가 가장 흔히 겪는 시나리오(앱을 안 보는 동안 온 푸시)에서 타 클라우드 점이 침묵한다. 인프라(App Group·SharedPreferences)가 이미 있어 마크 비용이 낮아진 점을 반영해 기각.
- **복귀 시 알림 트레이 introspection**(delivered notifications 읽기) — NSE·서비스 수정 없이 되지만, 사용자가 알림을 지우면 마크도 사라지고, 트레이 접근 권한·플랫폼 편차가 있다. 저장 기반 마크가 이미 싸므로 기각.
- **점 대신 카운트 동기화** — 요구사항이 명시적으로 점이다. 타 클라우드 카운트는 어차피 last-cached라 숫자가 거짓말을 한다. 기각.

## 결과 (Consequences)

**얻는 것**

- 비활성 플레이스·타 클라우드 모두 새 소식이 점으로 보인다. 데스크톱과 동작 패리티.
- 플레이스 점은 서버 부하 0으로 켜진다 — 기존에 앱 뱃지가 쓰던 캐시 관찰을 재사용.
- 백그라운드 도착분도 복귀 시 점으로 복원된다. 뱃지 카운터와 같은 저장소·같은 가드라 뱃지와 점이 어긋날 조건이 좁다.
- 빈 `cid` 역조회의 보수성(유일 매칭만) 덕에 오탐 점이 구조적으로 차단된다.

**감수하는 트레이드오프**

- 네이티브 마크는 **앱 릴리스가 있어야** 효력이 생긴다. 구버전 셸에서는 포그라운드 마크 + last-cached 힌트로 동작(우아한 축소).
- 빈 `cid` + 역조회 실패(비유일 매칭)면 점이 안 뜬다 — 의도된 보수성이지만 미탐은 존재한다.
- NSE·FCM 서비스 로직이 늘어난다. 네이티브 코드는 CI에서 컴파일 검증이 없으므로 실기 빌드 확인이 필수다.
- 마크 해제는 "그 클라우드로 전환"이 유일한 경로다. 시트에서 점만 보고 전환하지 않으면 점이 유지된다 — presence 표시의 의도된 동작.
- 홈의 unread 계산 입력이 활성 사이트 → 클라우드 전체로 늘어난다. 캐시-온리 관찰이라 네트워크 비용은 없지만, 채널 수가 큰 클라우드에서 재계산 빈도는 지켜볼 지점이다.
