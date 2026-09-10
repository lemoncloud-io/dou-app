# @chatic/shared

여러 앱이 함께 쓰는 프레임워크 중립 조각들. 도메인 지식이 없는 것만 여기 둔다 —
도메인이 붙으면 `@chatic/data`나 앱 쪽으로 간다.

| 폴더                 | 내용                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `components/`        | 앱 셸 조각 — `ErrorFallback` · `NotFoundPage` · `Toaster` · `GlobalLoader` · `VersionUpdateBanner`                   |
| `hooks/`             | 범용 훅 — `useDebounce` · `useInterval` · `useLocalStorage` · `useDeviceId` · `usePagination` · `useVersionCheck` 등 |
| `utils/`             | 순수 헬퍼 — `formatDate` · `resizeImage` · `storage` · `createQueryKeys` · `throwIfApiError`                         |
| `consts/` · `types/` | 공용 상수·타입                                                                                                       |

소비 파일이 120개로 리포에서 가장 넓게 쓰인다. 여기에 무언가 추가하기 전에 그것이 정말
도메인 중립인지 확인할 것 — 아니면 이 lib이 모든 것의 의존처가 된다.
