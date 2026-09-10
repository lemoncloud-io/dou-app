# @chatic/device-utils

웹뷰가 어떤 네이티브 셸 안에서 도는지 판별하고, 그 결과를 스토어에 담아 둔다.

- `useAppChecker` · `useDeviceInfo` — user agent 접두(`DOU_IOS` / `DOU_ANDROID`)로 플랫폼을 읽는다
- `deviceInfoStore` — 판별 결과를 앱 전역에서 다시 계산하지 않게 보관한다

**"네이티브 앱인가"를 여기서 묻지 않는다.** 런타임 판정은 `@chatic/app-runtime`의
`runtime.boot.isNativeApp()`이 소유한다 — 이 lib은 그 판정이 쓰는 재료(플랫폼·버전)를 준다.
