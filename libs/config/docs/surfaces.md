# 설정 표면(surface)과 화면 배치

> 대상: `@chatic/config` 레지스트리에 키를 더하는 사람, 또는 그 키의 컨트롤을 화면에 그리는 사람.
> 값 해석·레인 우선순위는 [architecture.md](./architecture.md)가 정본이다. 디버그 패널 자체의 이관
> 계획은 [apps/web/docs/architecture/debug-panel.md](../../../apps/web/docs/architecture/debug-panel.md)에 있다.
> 근거 ADR: [0079](../../../docs/adr/0079-config-registry-and-lane-resolver.md) ·
> [0080](../../../docs/adr/0080-debug-panel-shared-model-and-stage-visibility.md).

## 한 줄 계약

`surface`는 **이 키의 컨트롤을 어느 화면이 그리는가**만 정한다. 누가 쓸 수 있는지는 `writableBy`가,
어디에 저장되는지는 `persist`가 정한다. 셋은 직교한다 —
[types.ts](../src/types.ts)의 `Surface` 주석이 원문이다.

**surface를 선언한다고 화면이 생기지는 않는다.** 지금 리포에 레지스트리를 훑어 컨트롤을 자동으로
그리는 화면은 **없다**. 화면은 사람이 만들고, 그 화면이 키를 읽는다. 이 문서는 그 "사람이 만드는 쪽"의
지침이다.

## 지금 상태 (2026-09-10 실측, 84키)

| surface    | 키  | 화면                         | 상태                                       |
| ---------- | --- | ---------------------------- | ------------------------------------------ |
| `user`     | 4   | MY > 설정 · MY > 설정 > 알림 | 전용 컨트롤 4개가 이미 있다                |
| `labs`     | 0   | 설정 화면 안의 "실험실" 섹션 | 키도 섹션도 아직 없다                      |
| `dev`      | 67  | 웹 디버그 오버레이           | 오버레이는 있고, 키를 보여주는 화면이 없다 |
| `internal` | 13  | 없음                         | 코드가 읽고 쓴다. 컨트롤을 만들지 않는다   |

`dev` 67개의 내역: local 쓰기 가능 **47** · shell 전용 6 · 쓰기 주체 없는 읽기 전용 **14** ·
`meta: true` 4(패널이 렌더하지 않음, 아래 참고) · 서버가 끌 수 있는 것 33.

## surface별 배치와 추가 절차

### `user` — 일반설정

지금 네 키가 어디 있는지:

| 키                   | 화면                                                                                                     | 읽고 쓰는 곳         |
| -------------------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| `ui.theme`           | [SettingsPage](../../../apps/web/src/app/features/mypage/pages/SettingsPage.tsx) "앱" 섹션의 다크모드 행 | `useTheme`           |
| `ui.blurLastMessage` | [NotificationSettingsPage](../../../apps/web/src/app/features/mypage/pages/NotificationSettingsPage.tsx) | `useBlurLastMessage` |
| `ui.pushMuted`       | 같은 화면                                                                                                | `useDevicePushMute`  |
| `ui.language`        | **없다** — 언어설정 행은 `i18n.changeLanguage`를 직접 부른다                                             | 아무도 안 쓴다       |

`ui.language`는 선언만 있고 소비자가 없다(2026-09-10 실측). 셸 KV 이름만
[shellKvAdapter](../../../apps/web/src/app/config/shellKvAdapter.ts)에 매핑돼 있다. 언어를 레지스트리로
가져올 때는 i18next의 `lookupLocalStorage`(`@<project>_<env>.i18nextLng`)와 이 키 중 어느 쪽이 정본인지
먼저 정해야 한다 — 둘 다 살려두면 화면과 저장값이 갈린다.

**키를 하나 더할 때.**

1. 레지스트리에 선언한다 — `surface: 'user'`, `writableBy`에 `'local'` **필수**(불변조건),
   `title`·`description`은 한국어로 채운다.
2. `persist`를 고른다. 네이티브 셸과 값을 공유해야 하면 `'shell'`(테마처럼 셸의 pre-paint 스크립트나
   네이티브가 같이 읽는 값), 이 기기의 웹만 쓰면 `'local'`.
3. 쓰기 레인을 고른다. `config.set(key, v, { lane: 'shell' })`는 셸과 공유, `{ lane: 'local' }`은
   이 기기만. `ui.theme`가 앞, `ui.pushMuted`가 뒤의 예다.
4. 화면에 행을 만든다. 읽기는 `useConfigValue<T>(key)`, 쓰기는 `config.set`. 기존 행을 그대로 베끼면
   된다 — 새 패턴을 만들지 않는다.
5. i18n 키를 추가한다. 레지스트리의 `title`은 디버그/진단용 이름이지 화면 문구가 아니다.

**잠금 게이트는 적용되지 않는다.** 10탭 unlock은 `surface: 'dev'`에만 걸린다
([ConfigLanePolicy.canSupply](../src/resolve/ConfigLanePolicy.ts)). 일반 사용자의 설정이 PROD에서
잠기면 기능이 죽으므로 의도적으로 뺐다.

### `labs` — 실험실

**키가 하나도 없다. 화면도 없다.** 첫 키를 만드는 사람이 섹션까지 만든다.

1. `writableBy`에 `'server'`가 **반드시** 있어야 한다. 없으면 테스트가 깨진다 — 원격으로 끌 수 없는
   실험은 사용자에게 내보내지 않는다([registry/index.ts](../src/registry/index.ts)의
   `findPolicyViolations`).
2. `'local'`도 있어야 한다(user와 같은 불변조건). 사용자가 켜고 끌 수 있어야 실험이다.
3. `defaultValue`는 꺼진 값으로 둔다. 레인 순서상 `serverEnforced`가 로컬 오버라이드를 이기므로
   킬 스위치는 이미 동작한다 — 별도 배선이 필요 없다.
4. 화면은 설정 화면 안의 새 섹션이다. `MenuCard` 하나를 "실험실" 제목으로 더하고 그 안에 행을 넣는다.
   위치는 "앱" 섹션 아래, "지원" 위가 자연스럽다.
5. 실험을 접을 때 키를 지우는 것까지가 한 세트다. 남은 labs 키는 그 자체로 부채다.

### `dev` — 디버그 오버레이

진입 경로는 하나다. MY > 설정의 **앱버전 행 10탭** → 같은 화면에 "Debug Mode" 행이 나타나고, 그것이
[DebugOverlayHost](../../../apps/web/src/app/features/debug/overlay/DebugOverlayHost.tsx)를 연다.
LOCAL/DEV는 `debug.overlayEnabled`의 `byStage`가 그 마찰을 없애고, PROD는 `debug.entryCode`
(`VITE_DEBUG_CODE`, `writableBy: []`)로 fail-closed다.

여기에는 성격이 다른 둘이 섞여 있다.

**(a) 기능 테스트 화면** — 캐시·DB·업로드·푸시처럼 동작을 시켜보는 화면. 추가 비용은 세 곳이고 이미
구조가 서 있다: `overlay/debugMenu.ts`에 섹션 한 행, `overlay/screenRegistry.tsx`에 `lazy()` 한 줄,
`overlay/screens/<Name>Screen.tsx`에 본문. 섹션 이름은 한국어로 통일한다(ADR-0080 결정 3).

**(b) 설정값 자체** — 67개 키를 목록으로 보여주고 바꾸는 화면. **이것이 아직 없다.** ADR-0079 결정 16의
"화면 절반"으로 남아 있다([configStateLog.ts](../../app-runtime/src/config/configStateLog.ts)의 주석이
그렇게 적어뒀다). 만들 때 지킬 것은 아래 절에 모았다.

### `internal` — 화면 없음

코드가 읽거나, 제품 UI가 자기 흐름으로 쓴다(고정 채널, 최근 검색어, 온보딩 완료 같은 것). **컨트롤을
만들지 않는다.** 사람이 만질 값이 됐다면 `internal`이 아니라 `user`로 바꿀 일이다.

## 레지스트리가 강제하는 것

[`findPolicyViolations`](../src/registry/index.ts)가 검사하고, 위반은 테스트를 깨뜨린다. 런타임에서는
앱을 죽이는 대신 그 키를 버린다.

| 규칙                                        | 이유                                      |
| ------------------------------------------- | ----------------------------------------- |
| `user`·`labs`는 `writableBy`에 `local` 필수 | 웹에서 아무도 못 쓰는 사용자 설정은 모순  |
| `user`·`labs`는 `meta: true` 불가           | 잠금 키가 사용자 화면에 나오면 재귀       |
| `labs`는 `writableBy`에 `server` 필수       | 원격으로 못 끄는 실험은 내보내지 않는다   |
| `enum`은 `values` 필수                      | 선택지 없는 선택은 렌더할 수 없다         |
| `title`·`description` 필수                  | 이름 없는 키는 패널에서 정체를 알 수 없다 |

## 범용 설정 패널 — 다음에 만들 화면

`dev` 67키를 한 화면에서 보고 바꾸는 패널이다. 규칙:

1. **읽기는 `snapshotAll()`** — 값만이 아니라 출처(`origin`)와 쓰기 가능 여부(`canWrite`)가 함께 온다.
   화면이 우선순위를 다시 계산하지 않는다.
2. **`meta: true` 4키는 렌더하지 않는다** — `debug.overlayEnabled` · `debug.entryCode` ·
   `system.overridesUnlocked` · `system.remote.enabled`. 이들은 패널로 들어오는 문이지 패널의 내용이
   아니다(ADR-0080 결정 6).
3. **읽기 전용을 정직하게 표시한다.** 67개 중 14개는 쓰기 주체가 아예 없고 6개는 셸만 쓸 수 있다.
   비활성 컨트롤로 그리고 이유를 적는다 — 눌러도 안 되는 스위치가 제일 나쁘다.
4. **잠금 상태를 반영한다.** 잠겨 있으면 `dev` 키의 local 쓰기가 막힌다. `canWrite`가 이미 그것을
   계산해서 준다.
5. **`appliesAt`을 함께 보여준다.** `restart`인 키를 바꿔놓고 지금 적용됐다고 믿게 하면 안 된다.
   이 lib은 재연결도 재시작도 강제하지 않는다.
6. **도메인(점 앞부분)으로 묶는다.** 12개 모듈이 그대로 섹션이 된다 — auth · bridge · cache · debug ·
   env · feature · limit · log · net · sync · system · ui.

## 하지 말 것

- `surface`만 바꾸고 화면이 생기기를 기대하기. 자동 렌더러는 없다.
- `labs` 키를 `server` 없이 선언하기. 테스트가 막지만, 막히기 전에 설계가 틀린 것이다.
- 앱(RN)에 디버그 UI를 새로 만들기. ADR-0080 결정 12가 앱 디버그 UI를 0으로 만드는 방향이라 정반대다.
  웹에 화면을 만들고 브릿지 명령으로 앱을 시킨다.
- 설정값을 `@chatic/config.` 밖의 키로 직접 저장하기. 레지스트리를 우회하면 레인·잠금·스냅샷이 전부
  무의미해진다. 참고로 그 접두는 로그아웃 청소
  ([logoutStorageSweep](../../app-runtime/src/session/auth/logoutStorageSweep.ts))의 예외라 로그아웃해도
  살아남는다 — 로그아웃에 지워져야 하는 값이라면 설정이 아니라 세션 상태다.
- 사용자 설정을 `dev`로 선언해 놓고 일반 화면에 그리기. PROD에서 잠금 때문에 쓰기가 막힌다.

## 검증

```bash
npx jest --silent                        # libs/config — 레지스트리 불변조건 포함
npx tsc -b libs/config/tsconfig.lib.json # libs에서 tsc --noEmit은 no-op이다
```

화면을 붙였으면 그 앱의 테스트도 함께 돌린다(`apps/web`에서 `npx jest --silent`).

## 다른 트랙과의 경계

- 디버그 패널 이관(앱 화면 15개 → 웹)은 [debug-panel.md](../../../apps/web/docs/architecture/debug-panel.md)가
  정본이다. 이 문서는 "키를 어느 화면이 그리는가"만 다룬다.
- `libs/config/src/registry/debug.ts`는 그 트랙이 만지는 중이다. 같은 파일을 고쳐야 하면 먼저 확인한다.
