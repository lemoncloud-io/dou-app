# 플레이스 소개 문구 (Place Description)

> 상태: Live · 최종 갱신: 2026-09-07 · 관련 ADR: [[ADR-0074]](../../../../docs/adr/0074-place-introduction-text.md) (소개 문구 — 정본) · [[ADR-0047]](../../../../docs/adr/0047-place-detail-read-only-screen.md) (0074가 그 `desc` 배제를 취소했다) · [[ADR-0031]](../../../../docs/adr/0031-place-settings-hub.md) (설정 허브)

## 목적

플레이스(=Site)에 **소개 문구**(`desc`)를 달아, 정보 화면에서 읽고 편집 화면에서 고칠 수 있게 한다.
저장 경로는 기존 `place.update` 하나뿐이며, 그 요청 body의 `desc` 필드를 쓴다.

## 배경 — 이건 이전 결정을 뒤집는 작업이다

`desc`는 몰라서 빠진 필드가 아니라 **명시적으로 배제된** 항목이다.

- [ADR-0047](../../../../docs/adr/0047-place-detail-read-only-screen.md) §범위: "소개 문구(`desc`)는 Figma에 없어 넣지 않는다."
- [place-settings.md](place-settings.md) §범위 **제외**: "플레이스 소개 문구(`desc`) — Figma에 없다."

배제 사유는 "기술적으로 불가"가 아니라 "**디자인에 없다**"였다. 그 조건이 해소되어
[ADR-0074](../../../../docs/adr/0074-place-introduction-text.md)로 배제를 취소했고, 위 두 문서의
배제 문구도 함께 걷어냈다(§문서 갱신).

## 배선 현황 — 서버·데이터 계층은 이미 열려 있다

착수 시점에 앱 코드가 `desc`를 읽거나 쓰는 곳은 **0건**이었지만, 그 아래 전 계층은 이미 통과
상태였다. 새로 뚫은 배관은 없고 화면만 붙였다.

| 계층       | 심볼                                                                                                   | 상태                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 요청(SDK)  | `PlaceBodyData.desc?: string`                                                                          | `place.create`·`place.update` 공통 body에 이미 선언   |
| 응답(API)  | `MySiteView.desc?: string`                                                                             | `/** place introduction text (플레이스 소개 문구) */` |
| 도메인     | `DomainPlace = CacheSiteView = MySiteView & …`                                                         | 상속으로 `desc` 자동 포함 — 타입 추가 불필요          |
| 매퍼       | [`toDomainPlace`](../../../../libs/data/src/data/domain/mappers.ts)                                    | `...api` 스프레드 — 필드 화이트리스트 없음            |
| 캐시       | 로컬 데이터소스(JSON 저장)                                                                             | 컬럼 화이트리스트 없음 — 자동 영속                    |
| 리포지토리 | [`PlaceRepositoryV2.updatePlace`](../../../../libs/data/src/data/repositories-v2/PlaceRepositoryV2.ts) | 부분 페이로드 허용 + 낙관적 쓰기/롤백 내장            |

**막고 있던 유일한 지점**은 웹의 로컬 타입 하나였다 —
[`useUpdatePlace`](../../../src/app/features/home/hooks/useUpdatePlace.ts)의 `UpdatePlacePayload`가
`name`/`thumbnail`만 선언해 `desc`를 통과시키지 않았다. 필드 하나를 추가해 열었다.

### 미검증 가정 (서버 연결 후 실측할 것 — **아직 열려 있다**)

- `user.mysite`(목록) 응답이 `desc`를 실어 주는지. `MySiteView`가 타입상 선언하고 있으나,
  ADR-0047의 `ownerId`·`isOwner` 사례처럼 **relay/cloud에 따라 실제 유무가 갈릴 수 있다.**
  목록에 안 오면 정보 화면 진입 시 `place.get`이 채워 주는지까지 확인한다.
- 부분 업데이트(`{ id, name, desc }`)가 서버에서 `thumbnail`을 지우지 않는지.
  `PlaceEditPage`가 이미 `thumbnail`을 dirty일 때만 보내므로 기존 동작과 동일한 가정이지만,
  `desc`를 추가로 보내기 시작하는 첫 변경이라 한 번은 눈으로 확인한다.

실측 결과는 [place-settings.md](place-settings.md) §실측에 적는다.

## 결정 사항 (2026-09-07 기획 확인 — 정본은 [ADR-0074](../../../../docs/adr/0074-place-introduction-text.md))

| 항목                | 결정                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| 노출 화면           | 정보(`PlaceDetailPage`) · 수정(`PlaceEditPage`) · 설정 허브 미리보기            |
| 생성 흐름           | **제외** — `CreatePlaceDialog`·`SetupWizardPage`는 이번 범위 아님               |
| 빈 값(정보 화면)    | **행 자체를 숨긴다** — 기존 "서버가 주지 않은 사실은 그리지 않는다" 원칙 그대로 |
| relay 기본 플레이스 | **노출한다** — 만든 날짜·소유자와 달리 DoU 홈에서도 그린다                      |
| 글자 수 제한        | **100자**                                                                       |

## 범위

**포함**

- `PlaceDetailPage`: 소개 문구 `InfoField` 행 추가(값이 없으면 행 생략).
- `PlaceEditPage`: 소개 문구 입력 필드 추가 + dirty 판정 + `place.update` 페이로드.
- `PlaceSettingsHubPage`: "플레이스 정보" 행의 `subtitle`에 소개 문구 미리보기(한 줄 말줄임).
- `useUpdatePlace`: `UpdatePlacePayload`에 `desc?: string`.
- i18n ko/en 키.
- 테스트: `PlaceDetailPage.test.tsx` 케이스 추가, `PlaceEditPage.test.tsx` **신규**, `PlaceSettingsHubPage.test.tsx` 케이스 추가.
- 문서 갱신(§문서 갱신).

**제외**

- **플레이스 생성 시 소개 입력** — `PlaceCreateRequestData`도 `desc`를 받지만 이번 범위 아님.
  `useCreatePlace`의 `CreatePlaceInput` 확장이 필요해지므로 별도 작업으로 둔다.
- 홈 플레이스 목록(`PlaceList`)·플레이스 전환 UI에서의 소개 노출.
- 모바일 앱(`apps/mobile`)·데스크톱(`desktop-web`) 변경 — 웹 화면만 다룬다.
- `desc` 서버 검증(길이·금칙어) — 클라이언트 100자 클램프만 둔다.

## 시나리오

1. **정보 조회(소개 있음)** — 허브 → "플레이스 정보". 아바타 아래 정보 행들 사이에
   "플레이스 소개" 라벨 + 소개 문구가 보인다. relay(DoU 홈)·cloud 모두 동일하게 그린다.
2. **정보 조회(소개 없음)** — 소개 행이 **아예 없다.** 빈 값·플레이스홀더("-")를 그리지 않는다.
   만든 날짜·소유자 행과 같은 규칙이다.
3. **수정(오너)** — 허브 → "플레이스 프로필" → `PlaceEditPage`. 이름 필드 아래에 소개 입력 필드.
   초기값은 현재 `desc`. 100자를 넘겨 입력할 수 없다. 이름/사진과 마찬가지로 **바뀌어야** "완료"가 켜진다.
4. **수정 저장** — `updatePlace({ id, sid, name, desc?, thumbnail? })`. 소개가 dirty일 때만 `desc`를 싣는다.
   낙관적 캐시 반영 → 뒤로. 실패 시 기존과 동일한 에러 토스트 + 리포지토리 롤백.
5. **소개 지우기** — 입력을 비우고 저장하면 `desc: ''`가 전송된다.
   되돌아온 정보 화면에서는 시나리오 2에 따라 행이 사라진다.
6. **수정(비오너)** — 변화 없음. 허브 행이 disabled고 `PlaceEditPage`는 `navigate(-1)` 백스톱.
7. **허브 미리보기** — "플레이스 정보" 행의 부제로 소개 첫 줄이 말줄임되어 보인다.
   소개가 없으면 부제 없이 기존 모습 그대로.
8. **이탈 가드** — 소개만 고치고 뒤로 가도 `isDirty`가 참이라 기존 이탈 확인 다이얼로그가 뜬다.

## 상세 구현

### 1) `useUpdatePlace` — 페이로드 확장

`apps/web/src/app/features/home/hooks/useUpdatePlace.ts`

```ts
interface UpdatePlacePayload {
    /** Backend requires `@id` on place.update; for a place, id === sid. */
    id: string;
    sid: string;
    name?: string;
    thumbnail?: string;
    /** Place introduction text. Empty string clears it. */
    desc?: string;
}
```

훅 본문은 그대로다 — 페이로드를 그대로 리포지토리에 넘기므로 타입만 열면 된다.

### 2) `PlaceEditPage` — 입력 필드

`apps/web/src/app/features/place/pages/PlaceEditPage.tsx`

- 상수: `const MAX_DESC_LENGTH = 100;`
- 상태: `const [desc, setDesc] = useState('');`
- 시드: 기존 `seededPlaceIdRef` 블록에 `setDesc(place.desc ?? '')` 추가.
  **같은 블록 안에서** 해야 배경 재방출이 편집 중 입력을 덮지 않는다.
- dirty: `const isDescDirty = desc !== (place?.desc ?? '');` → `isDirty`에 OR.
- 제출: `...(isDescDirty && { desc })`.
- 컴포넌트 선택: **`Textarea`**(이미 `@chatic/web-ui-kit`에 있고 `FeedbackPage`가 쓰는 선례).
  단 `Textarea`는 문서상 **의도적으로 카운터가 없고** 하드 캡도 없다 —
  "callers that need a hard cap clamp in `onChange`". 따라서
  `onChange={v => setDesc(v.slice(0, MAX_DESC_LENGTH))}`로 호출부에서 클램프한다.
  100자에 카운터가 꼭 필요하다는 디자인이면 `Textarea`에 opt-in 카운터 prop을 추가하는 쪽이
  맞다(컴포넌트 주석이 그 확장을 예고해 둠). 화면에서 임기응변으로 카운터를 그리지 않는다.
- 높이: `Textarea`의 기본 198px은 피드백 폼의 5000자용이다. 100자에는 과해 `height={116}`
  (`DESC_BOX_HEIGHT`)으로 낮췄다. **116은 실측값이다** — 최악의 경우(전부 CJK)가 20.3px 4줄(81px)로
  감싸지므로 박스의 세로 패딩 16px×2를 더해 113px이 필요하다. 처음 잡았던 96px에서는 마지막 줄이
  잘려, 꽉 채워 쓴 사용자가 자기 글을 다시 읽으려면 스크롤해야 했다(브라우저 실측으로 발견).
  디자인 값이 따로 나오면 그 상수만 바꾸면 된다.

### 3) `PlaceDetailPage` — 정보 행

`apps/web/src/app/features/place/pages/PlaceDetailPage.tsx`

이름 행 다음, 만든 날짜 행 앞에 넣었다.

<!-- prettier-ignore -->
```tsx
{place.desc && (
    <InfoField label={t('placeDetail.descLabel')}>
        <Text variant="body" className="whitespace-pre-wrap text-foreground">
            {place.desc}
        </Text>
    </InfoField>
)}
```

`isHomePlace` 분기를 **걸지 않는다** — 만든 날짜·소유자와 달리 relay에서도 그린다는 결정이다.
빈 문자열은 falsy라 행 숨김 규칙이 그대로 성립한다.

`InfoField`는 문자열 자식을 `Text variant="body"`로 감싸지만 줄바꿈은 보존하지 않는다. 소개는 여러
줄일 수 있어 같은 스타일의 `Text`를 직접 넘기고 `whitespace-pre-wrap`을 얹었다 — `InfoField`는 노드
자식을 그대로 배치하므로 라벨·간격은 다른 행과 동일하게 유지된다.

### 4) `PlaceSettingsHubPage` — 미리보기

```tsx
<ListRow
    title={t('placeSettings.placeDetail')}
    subtitle={place?.desc || undefined}
    …
/>
```

`ListRow`의 `subtitle`은 `truncate`라 한 줄 말줄임이 공짜로 나온다. 별도 자르기 불필요.

### 5) i18n

`apps/web/public/locales/{ko,en}/translation.json`

| 키                          | ko                            | en                                 |
| --------------------------- | ----------------------------- | ---------------------------------- |
| `placeDetail.descLabel`     | 플레이스 소개                 | Place Introduction                 |
| `placeEdit.descLabel`       | 플레이스 소개                 | Place Introduction                 |
| `placeEdit.descPlaceholder` | 플레이스를 소개해 주세요      | Introduce your place               |
| `placeEdit.descDescription` | 100글자 이내로 입력해 주세요. | Please enter up to 100 characters. |

기존 `nameDescription`("20글자 이내로 입력해 주세요.")과 문형을 맞춘다.

## 검증 방법

**완료**

- **유닛** — `npx nx test web` 244 스위트 / 2362 테스트 그린.
    - `PlaceEditPage.test.tsx` (8, **신규** — 이 화면에 테스트가 처음 생겼다): 소개 초기값 시드,
      값 없으면 빈 값, 100자 클램프, 소개만 고쳐도 저장 활성, 바뀐 소개만 페이로드에 실림,
      이름만 고치면 `desc` 미전송, 비우면 `''` 전송, 배경 재방출이 편집 중 입력을 덮지 않음.
      `PlaceDetailPage.test.tsx`의 목 구성을 따랐다 — `../../../ui` 배럴은 `@chatic/assets`를
      끌어와 jest가 파싱하지 못하므로 반드시 목해야 하고, `../../home`(=`useUpdatePlace`)을 목해
      페이로드를 그 seam에서 관찰한다.
    - `PlaceDetailPage.test.tsx` +5: `desc` 있음 → 행 렌더 / 없음 → 행 부재 / **빈 문자열도 행 부재** /
      줄바꿈 보존 / **DoU홈에서도 렌더**(relay 예외를 소개에 실수로 적용하면 깨지는 회귀 방어).
    - `PlaceSettingsHubPage.test.tsx` +2: 부제 미리보기, 빈 소개면 부제 없음.
- **뮤테이션 검증** — 클램프(`slice`) 제거와 dirty 게이팅(`isDescDirty &&`) 제거를 각각 넣어
  해당 테스트가 실제로 실패하는 것을 확인했다. 두 테스트가 헛돌지 않는다는 근거다.
- **브라우저 실측** — 워크트리 vite(`preview_start name=web`), 게스트 부팅 + IndexedDB
  (`ChaticWebCacheDB` / `cache_store`)의 `site:*` 행에 `desc`·`isOwner`를 주입해 relay 기본플레이스로
  세 화면을 확인했다. (1) 허브 부제 미리보기 한 줄 말줄임, (2) **DoU홈 정보 화면에 소개 행이 렌더**
  (만든 날짜·소유자 행은 그대로 부재 — 분기가 의도대로 갈렸다), (3) 편집 화면 시드·저장 버튼
  dirty 게이트·150자 입력 시 정확히 100자로 클램프. 이 과정에서 박스 높이 96px의 잘림을 발견해
  116px로 고쳤다(위 §2).
- **정적 검사** — 변경 파일 eslint·prettier 클린. `npx tsc --noEmit -p apps/web/tsconfig.app.json` 0건
  ([[web-typecheck-blocked-by-libs-data]]의 우회법). `tsconfig.spec.json`은 TS5095(`module`/
  `moduleResolution` 불일치)로 애초에 돌지 않는 **선재 부채**라 이번 변경과 무관하다.

**남음**

- **서버 왕복** — (1) relay·cloud 각각 `desc` 저장·재조회, (2) 소개 지우기(`desc: ''`)가 서버에서
  실제로 지워지는지, (3) 저장 후 `thumbnail`이 살아 있는지, (4) `user.mysite` 목록이 `desc`를 싣는지
  (§미검증 가정). **위 브라우저 확인은 캐시를 직접 주입한 것이라 서버 왕복을 대신하지 못한다.**

## 문서 갱신 (완료 — 구현과 같은 커밋)

이번 변경은 문서에 적힌 배제를 뒤집으므로, 코드만 바꾸고 문서를 두면 **문서가 거짓말이 된다.**

1. **[ADR-0074](../../../../docs/adr/0074-place-introduction-text.md) 신설** — 소개 문구 결정의 정본.
   ADR-0047 본문을 고쳐 과거 결정을 지우는 대신 신규 ADR로 개정했다(ADR-0012 → ADR-0020이 선례).
2. **[ADR-0047](../../../../docs/adr/0047-place-detail-read-only-screen.md)** — 헤더 상태를
   "Accepted (일부 개정됨)"으로 바꾸고 개정 링크를 달았다. §범위의 배제 문장은 지우지 않고
   취소선 + 취소 사유를 병기했다.
3. **[place-settings.md](place-settings.md)** — §범위 **제외**에서 배제 항목을 삭제하고 **포함**·§시나리오
   6·8·§다이어그램·§검증 방법에 소개를 반영했다. 특히 시나리오 8과 mermaid 분기 노드에
   **"소개는 relay 예외를 타지 않는다"**를 명시했다 — 이 문서의 DoU홈 서술이 "이름만"이라
   그대로 두면 새 행과 어긋난다.
4. **[README.md](README.md)** — 화면 표 두 줄, 구조 트리 주석, §데이터 흐름의 `useUpdatePlace`
   시그니처, §주요 결정에 relay 예외 항목을 추가했다.

### Figma 노드 번호가 비어 있다

ADR-0074는 근거로 **2026-09-07 기획 확인**만 적고 있다. 이 리포의 다른 place ADR들은 Figma 노드
번호를 근거로 남기는데(예: ADR-0047의 3769-34207), 이번에는 노드 번호를 받지 못했다.
디자인이 확정되면 ADR-0074 §맥락에 노드 번호를 채우고, 아래 두 값이 디자인과 맞는지 확인한다.

- 소개 행의 **위치** — 지금은 이름 다음, 만든 날짜 앞.
- 입력 박스 **높이** — 지금은 `DESC_BOX_HEIGHT = 116`(100자 CJK 4줄이 스크롤 없이 들어가는 실측값이지 디자인 값은 아니다). 카운터 노출 여부도 함께 확인한다.
