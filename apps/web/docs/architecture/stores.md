# 전역 설정 (구 preference)

> 대상: `apps/web/src/app/stores`, `apps/web/src/app/config`, `apps/web/src/app/hooks`
> 정본: [`@chatic/config` 아키텍처 문서](../../../../libs/config/docs/architecture.md) (ADR-0079/0080)

영구 앱 상태는 더 이상 `usePreferenceStore` 하나로 통합되지 않는다 — `@chatic/config`의 레지스트리
키(`ui.*`)로 옮겨갔다. 이 문서는 `@chatic/config`가 이미 설명하는 레인·정책을 반복하지 않고,
**apps/web이 그 라이브러리를 어떻게 배선했는지**만 적는다.

## 상태는 어디 있나

각 설정은 이제 `config.get('ui.<key>')`가 답한다. `apps/web/src/app/stores/`에는 저장소가 아니라
스토리지와 무관한 순수 도메인 값만 남는다: `Theme`/`ChannelSortMethod` 타입,
`placeScopeKey`/`isPlaceScopeKey`, `DEFAULT_CHANNEL_SORT`, `CLOUD_PROMO_DISMISS_TTL_MS`,
`MAX_RECENT_SEARCHES` (`preferenceKeys.ts`) — 그리고 `type:'json'` 키의 방어적
파서/정규화 함수(`channelSort`/`pinnedChannels`/`recentSearches`/`cloudPromoDismissedAt`/레거시
테마 봉투, `preferenceParsers.ts`).

| 레지스트리 키               | 옛 `PreferenceState` 필드 | 훅                       |
| --------------------------- | ------------------------- | ------------------------ |
| `ui.theme`                  | `theme`                   | `useTheme` (`app/hooks`) |
| `ui.blurLastMessage`        | `blurLastMessage`         | `useBlurLastMessage`     |
| `ui.onboardingCompleted`    | `isFirstRun` (반대 극성)  | `useOnboarding`          |
| `ui.pushMuted`              | `pushMuted`               | `useDevicePushMute`      |
| `ui.channelSort`            | `channelSort`             | `useChannelSort`         |
| `ui.pinnedChannels`         | `pinnedChannels`          | `usePinnedChannels`      |
| `ui.recentSearches`         | `recentSearches`          | `useRecentSearches`      |
| `ui.dismissedUpdateVersion` | `dismissedUpdateVersion`  | `useAppUpdatePrompt`     |
| `ui.cloudPromoDismissedAt`  | `cloudPromoDismissedAt`   | `useCloudPromo`          |

각 훅은 `useConfigValue('ui.x')`(`@chatic/config/react`)로 읽고 `config.set('ui.x', value, {
lane })`으로 쓴다 — **레인 선택이 키마다 고정이다.** `persist:'shell'`인 키(theme·
blurLastMessage·onboardingCompleted)는 반드시 `{ lane: 'shell' }`로 쓴다: `local`로 쓰면
네이티브가 채운 `shell` 레인보다 우선순위가 낮아 조용히 가려진다(`ConfigLanePolicy`의 행 순서).
나머지는 `persist:'local'`, `{ lane: 'local' }`.

`canceledInvites`는 표에 없다 — config 키가 되지 않았다. ADR-0043 시절의 레거시 취소 스탬프를
invite 캐시의 `dismissedAt`으로 옮기는 **드레이닝 전용** 데이터라 `useInviteDismissMigration.ts`가
레거시 키(`dou.relayInvite.locallyCanceled.v1`)를 직접 읽고 지운다. `language`/`debugSettings`는
`usePreferenceStore`가 관리한 적이 없는 죽은 선언이었다(아래 "범위 밖" 참고) — config로도
옮기지 않았다.

## 저장 모델

`@chatic/config`의 레인·`persist` 정책이 정본이다(위 링크). apps/web 쪽에서 알아야 할 건 두
가지뿐이다.

1. **`persist:'shell'` 키는 네이티브 브릿지 + 로컬 미러 둘 다에 쓰인다.** `ConfigFacade`가
   `storageFor('shell')`을 `local` 스토리지로도 풀어주므로, 셸이 없는 평범한 브라우저에서도
   다음 새로고침에 값이 살아남는다 — 셸이 있으면 `shell` 레인이 항상 이긴다(우선순위 불변).
2. **`ui.theme`만 예외다.** 저장 위치가 `@chatic/config`의 네임스페이스 키
   (`@chatic/config.ui.theme`)가 아니라 여전히 `vite-ui-theme`다 — 이 키를 `index.html`
   프리페인트 스크립트 5개(web·desktop-web·admin-v2·testbed·block-kit-builder)와
   `@chatic/theme`의 `ThemeProvider`가 전부 직접 읽고 쓴다(공유 기기 계약).
   `app/config/legacyPreferenceMigration.ts`의 `syncThemeFromSharedKey()`가 매 부팅
   `vite-ui-theme`를 `ui.theme`의 네임스페이스 저장소로 동기화하고, `useTheme.ts`의 `setTheme`은
   `config.set()`과 별개로 `vite-ui-theme`에도 직접 쓴다.

## 레거시 저장값 승계 — `legacyPreferenceMigration.ts`

`main.tsx`가 `config.init()` **이전에** 호출한다 — `hydrateStorage()`가 읽어들이는 값을 이 시점에
채워 둬야 하기 때문이다.

- `migrateLegacyPreferences()` — 일회성. 옛 `chatic-*`/`dou.relayInvite.*` 키를 읽어
  `storageKeyFor(newKey)`에 다시 쓰고 옛 키를 지운다. 옛 키가 없으면(이미 이관됨, 또는 애초에 값이
  없던 사용자) 아무 일도 하지 않는다 — 플래그가 아니라 "옛 키가 남아 있는가"로 완료 여부를
  판단하므로, 삭제가 곧 완료 표시다.
- `syncThemeFromSharedKey()` — 위에서 설명한 영구(매 부팅) 동기화. 이관이 아니라 미러링이라 옛
  키를 지우지 않는다.

## Native hydration — `PreferenceLoader`

세 키(`ui.blurLastMessage`·`ui.onboardingCompleted`·`ui.theme`)만 구 셸 대비 비동기 폴백을
갖는다 — 웹이 앱보다 먼저 배포되므로, `CHATIC_APP_CONFIG_BAG` 부팅 주입을 아직 모르는 구버전
앱에서는 `config.snapshot(key)?.isOverridden`이 계속 false다. 그 경우에만 레거시
`FetchPreference` 브릿지로 값을 가져와 `{ lane: 'shell' }`로 채운다 — 새 부팅 주입이 있었다면
했을 일을 느리게 대신하는 것이며, 이 값도 그대로 로컬 미러에 남아 다음 부팅부터는 폴백 없이
동기로 풀린다.

`isFirstRun`(레거시, `true`=온보딩 미완료) → `onboardingCompleted`(신규, `true`=완료)는 극성이
반대라 폴백 경로에서 반전한다. 테마는 모바일의 zustand-persist JSON 봉투 형태로 올 수 있어
`parseThemeBridgeValue`로 정규화한다.

## 범위 밖 (의도)

- `debugSettings` (`chatic_debug_mode`) — `usePreferenceStore` 시절에도 관리한 적 없는 죽은
  선언이었다(ADR-0080 결정 13이 지운 URL 전환 기능의 잔재). config로 옮기지 않았다.
- `language` — 리포 전체에서 `chatic-language`를 읽거나 쓰는 곳이 0곳이었다. 실제 언어는
  i18next의 `LanguageDetector`가 완전히 별도 키(`@${PROJECT}_${ENV}.i18nextLng`)로 자체 관리한다.
  `ui.language` 레지스트리 키는 선언돼 있지만 아직 소비자가 없다 — i18next를 config로 갈아끼우는
  건 이번 이관과 별개의, 더 큰 작업이다.
- 모바일 `debugSettingsStore`(`mockServiceMode`·`overlay*` 등) — 쓰는 화면 자체가 아직 없어
  통합하지 않았다. `logUploadHold`/`debugModeEnabled`는 이 스토어와 무관한 전용 브릿지 메시지로
  이미 동작한다.
- 세션/토큰 → web-core.
