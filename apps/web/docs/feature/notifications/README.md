# notifications

> 대상: `apps/web/src/app/bridge/navigation` · 관련: [device-token](./device-token.md), [debug/push-verification](../debug/push-verification.md), [architecture/bridge.md](../../architecture/bridge.md), [architecture/routing.md](../../architecture/routing.md)

## 책임

푸시 알림 탭·딥링크로 네이티브가 보내는 **능동 네비게이션**(`OnNavigate`)을 받아, 대상 화면(주로 채널방)으로 이동시킨다. 대상이 다른 클라우드/사이트에 있으면 **클라우드 전환 → 사이트 전환 → 이동** 순서를 보장한다.

푸시 배너 조립·표시는 네이티브(Android `FirebaseMessagingService`, iOS Notification Service Extension) 책임이고, 웹은 배너 탭 이후의 **앱 내부 라우팅만** 담당한다.

## 경로 계약

네이티브가 보내는 `OnNavigate` 페이로드는 `{ path, replace? }`이며, `path`는 웹 라우트와 정합한다. cid/sid는 링크 쿼리로 전달된다.

| 형태            | 예시                                            | 처리                                                |
| --------------- | ----------------------------------------------- | --------------------------------------------------- |
| 정규 라우트     | `/channels/1000001/room`                        | 그대로 이동                                         |
| 크로스-클라우드 | `/channels/1000001/room?cid=cloud_1&sid=site_9` | `cid`/`sid`로 전환 후 이동 (쿼리는 target에서 제거) |
| 스펙 폴백       | `channel?channelId=1000001`                     | `/channels/1000001/room`으로 정규화                 |
| 기타 경로       | `/auth/login?code=xyz`                          | 그대로 통과 (`cid`/`sid`만 있으면 추출·제거)        |

> `cid`/`sid`는 라우트 파라미터가 아니라 세션 컨텍스트이므로 이동 target에서 제거한다.

## 구조

```
bridge/navigation/
  resolvePushNavigation.ts   # 순수 함수: path → { target, cid, sid } (정규화 + cid/sid 추출)
  usePushNavigate.ts         # 공용 원시: 해석 → 핸드셰이크 대기 → switchCloud → switchSite → 히스토리 정규화
  useHandlePushNavigation.ts # 네이티브 OnNavigate(탭·딥링크) 진입점 → usePushNavigate
  pendingNavigationStore.ts  # 라우터 마운트 전에 도착한 OnNavigate를 보관해 재생
  index.ts
features/notifications/
  hooks/useInAppPushMessage.tsx    # 포그라운드 인앱 배너 + 탭 → usePushNavigate
  utils/resolveInAppPushRoute.ts   # 인앱 페이로드 → raw path
```

`UnifiedLayout`이 `useHandlePushNavigation()`과 `useInAppPushMessage()`를 소비한다. **두 진입점이 같은 `usePushNavigate`로 수렴해** 네이티브 탭과 인앱 배너 탭이 동일하게 동작한다. 라우터 트리 내부에서만 동작한다(`useNavigate` 의존).

## 흐름

```
네이티브 푸시 탭
  → OnNavigate { path } (bridge)
  → useHandlePushNavigation
     → resolvePushNavigation(path) → { target, cid, sid }
     → cid && cid !== 현재 cloud  ? await switchCloud(cid)   (사이트 clear됨)
     → sid && sid !== 현재 site   ? await switchSite(sid)
     → navigateNormalized(target)   # 방을 떠날 때만 replace, 그 외에는 push
```

**전환은 반드시 이동보다 먼저 await한다.** 채널 데이터는 활성 서버(`activeServer`)의 repository에서 로드되므로([`useChannel`](../../../src/app/features/channels/hooks/useChannel.ts)), 전환 전에 이동하면 방이 채널을 찾지 못한다. `switchCloud`는 선택 사이트를 clear하므로 사이트 전환은 그 뒤에 온다.

**히스토리는 방만 버린다.** 반복 탭이 `[home, roomA, roomB, …]`로 방을 쌓으면 뒤로가기가 죽은 방들을 훑게 되므로, **떠나는 화면이 방일 때만** 현재 엔트리를 replace한다. 마이페이지처럼 사용자가 스스로 고른 화면은 push해서 뒤로가기가 돌아올 자리를 남긴다 — 이전에는 "홈이 아니면 전부 replace"였고, 그래서 마이페이지에서 인앱 메시지를 탭하면 뒤로가기가 죽었다.

**캐시에 없는 방이라고 즉시 홈으로 보내지 않는다.** `observeItem`은 첫 응답을 로컬 캐시만 보고 주므로 처음 보는 방은 fetch 중에도 `null`이 온다. 그걸 부재로 단정해 리다이렉트하면 `useChannelSync`가 언마운트돼 그 fetch까지 끊기고, 방이 영구히 열리지 않았다. 이제 [`useChannel`](../../../src/app/features/channels/hooks/useChannel.ts)이 행이 도착할 때까지 기다리고, 제한 시간을 넘기면 홈으로 튕기는 대신 방 화면이 에러와 돌아가기를 보여준다([ChannelRoomPage.tsx](../../../src/app/features/channels/pages/ChannelRoomPage.tsx)).

전환 실패 시에도 best-effort로 `navigate(target)`을 시도해 사용자가 멈추지 않게 한다.

## 관련 훅 (web-core)

| 훅                                         | 용도                                           |
| ------------------------------------------ | ---------------------------------------------- |
| `useSessionSelection`                      | 현재 `selectedCloudId` / `selectedSiteId` 읽기 |
| `useSwitchCloudSession().switchCloud(cid)` | 클라우드 전환 (위임 토큰 교환, 사이트 clear)   |
| `useSiteSwitch().switchSite(sid)`          | 사이트 전환 (`uid@sid` 토큰 갱신)              |

## 모바일 탭 라우팅

Android는 **data-only FCM**(notification 객체 없음)이고 배너는 네이티브가 조립한다. 배너 탭 → 웹 `OnNavigate`까지:

- **Android(백그라운드/콜드스타트) 탭**: 네이티브 서비스가 `payload`의 `cid`/`sid`를 링크 쿼리에 병합한 뒤 `action=ACTION_VIEW` + `data=Uri.parse(link)`로 `PendingIntent`를 세팅한다([`ChaticFirebaseMessagingService.kt`](../../../../mobile/android/app/src/main/java/io/chatic/dou/push/ChaticFirebaseMessagingService.kt)). 탭 시 RN(`0.83`)이 `Linking` `'url'` 이벤트를 자동 emit → `DeepLinkManager` → `useWebViewDeepLink` → OnNavigate. 콜드스타트는 `Linking.getInitialURL()` 경로. **`MainActivity` 추가 오버라이드 불필요.** ✅
- **iOS 탭**: iOS는 `aps.alert` + `mutable-content:1`이라 RNFirebase `onNotificationOpenedApp` / `getInitialNotification`([`useFcmHandler.ts`](../../../../mobile/src/app/webview/hooks/useFcmHandler.ts))이 발화한다. `resolvePushPath`가 `link` + `payload`의 `cid`/`sid`를 경로 쿼리로 합쳐 `OnNavigate`를 브릿지로 **직접 발행**한다(`Linking.openURL` 왕복 없음). 콜드스타트는 브릿지 버퍼가 `WebAppReady`까지 보관 후 전달. 실기기 검증 권장.
- **Foreground**: 네이티브 이벤트 → `OnReceiveNotification` → [`useInAppPushMessage`](../../../src/app/features/notifications/hooks/useInAppPushMessage.tsx)가 인앱 배너를 띄우고, **탭하면 `usePushNavigate`로 네이티브 탭과 같은 경로를 탄다**(전환 + 히스토리 정규화). 페이로드→경로 변환은 [`resolveInAppPushRoute`](../../../src/app/features/notifications/utils/resolveInAppPushRoute.ts). 지금 보고 있는 방의 메시지는 배너를 띄우지 않는다. 디버그 소비처 [`useReceivedPushLog`](../../../src/app/features/debug/hooks/useReceivedPushLog.ts)도 함께 수신을 기록한다 → [device-token](./device-token.md).
- **cid/sid 전달**: `cid`/`sid`는 `payload`에 있고 `link`와 별개다. 모바일이 이를 `OnNavigate` 경로 쿼리로 병합해 웹까지 넘긴다 — Android는 네이티브에서 링크 URI에, iOS는 `resolvePushPath`에서. 웹은 위 [경로 계약](#경로-계약)대로 쿼리에서 읽어 전환·제거한다. 모바일 상세: [mobile/docs/push.md](../../../../mobile/docs/push.md), [mobile/docs/deeplink.md](../../../../mobile/docs/deeplink.md).

> data-only인 Android 탭은 RNFirebase 콜백을 발화시키지 않으므로 네이티브 인텐트 → `Linking` 경로가 담당하고, iOS는 반대로 RNFirebase 콜백 경로를 쓴다. 두 경로 모두 동일한 `OnNavigate { path }` 계약으로 수렴한다.

## 미구현(의도적 부재)

- **배지 최종 반영**: `payload.badge` + 활성 채팅방·unread 조합. 별도 과제.
