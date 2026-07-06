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
  useHandlePushNavigation.ts # 훅: 해석 → switchCloud → switchSite → navigate 오케스트레이션
  index.ts
```

`UnifiedLayout`이 `useHandlePushNavigation()` 한 줄로 소비한다. 라우터 트리 내부에서만 동작한다(`useNavigate` 의존).

## 흐름

```
네이티브 푸시 탭
  → OnNavigate { path } (bridge)
  → useHandlePushNavigation
     → resolvePushNavigation(path) → { target, cid, sid }
     → cid && cid !== 현재 cloud  ? await switchCloud(cid)   (사이트 clear됨)
     → sid && sid !== 현재 site   ? await switchSite(sid)
     → navigate(target, { replace })
```

**전환은 반드시 이동보다 먼저 await한다.** 채널 데이터는 활성 서버(`activeServer`)의 repository에서 로드되므로([`useChannel`](../../../src/app/features/channels/hooks/useChannel.ts)), 전환 전에 이동하면 `ChannelRoomPage`가 채널을 못 찾고 홈으로 리다이렉트한다([ChannelRoomPage.tsx](../../../src/app/features/channels/pages/ChannelRoomPage.tsx)). `switchCloud`는 선택 사이트를 clear하므로 사이트 전환은 그 뒤에 온다.

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
- **Foreground**: 네이티브 이벤트 → `OnReceiveNotification`(배너만, 네비게이션 없음). 프로덕션 toast/nav는 미구현이나, 디버그 소비처 [`useReceivedPushLog`](../../../src/app/features/debug/hooks/useReceivedPushLog.ts)가 수신을 기록·로깅한다 → [device-token](./device-token.md).
- **cid/sid 전달**: `cid`/`sid`는 `payload`에 있고 `link`와 별개다. 모바일이 이를 `OnNavigate` 경로 쿼리로 병합해 웹까지 넘긴다 — Android는 네이티브에서 링크 URI에, iOS는 `resolvePushPath`에서. 웹은 위 [경로 계약](#경로-계약)대로 쿼리에서 읽어 전환·제거한다. 모바일 상세: [mobile/docs/push.md](../../../../mobile/docs/push.md), [mobile/docs/deeplink.md](../../../../mobile/docs/deeplink.md).

> data-only인 Android 탭은 RNFirebase 콜백을 발화시키지 않으므로 네이티브 인텐트 → `Linking` 경로가 담당하고, iOS는 반대로 RNFirebase 콜백 경로를 쓴다. 두 경로 모두 동일한 `OnNavigate { path }` 계약으로 수렴한다.

## 미구현(의도적 부재)

- **Foreground 인앱 알림(프로덕션)**: `OnReceiveNotification` 수신 시 토스트 + 탭 네비게이션. 프로덕션 소비처는 아직 없다. (디버그 전용 소비처 `useReceivedPushLog`는 존재 — 수신 기록·로깅만, [debug/push-verification](../debug/push-verification.md).)
- **배지 최종 반영**: `payload.badge` + 활성 채팅방·unread 조합. 별도 과제.
