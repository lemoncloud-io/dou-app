# ADR-0074: 플레이스 소개 문구 — ADR-0047의 `desc` 배제를 뒤집는다

> 상태: Accepted · 결정일: 2026-09-07
> · [ADR-0047](0047-place-detail-read-only-screen.md)(플레이스 정보 화면)의 **개정** — 그 §범위의 `desc` 배제를 취소한다
> · [ADR-0031](0031-place-settings-hub.md)(설정 허브)의 오너 게이트를 그대로 따른다
> · 화면·구현 상세는 [place-desc.md](../../apps/web/docs/feature/place/place-desc.md), 설정 전반은 [place-settings.md](../../apps/web/docs/feature/place/place-settings.md)

## 맥락 (Context)

ADR-0047이 플레이스 정보 화면을 세울 때 소개 문구(`desc`)를 명시적으로 **뺐다**:

> 소개 문구(`desc`)는 Figma에 없어 넣지 않는다. — ADR-0047 §범위

`place-settings.md`의 제외 목록도 같은 사유를 적었다("Figma에 없다"). 즉 배제 사유는 **기술적 불가가 아니라 디자인 부재**였고, 디자인이 생기면 되살아나는 종류의 결정이었다. 기획이 소개 문구를 요구하면서 그 조건이 충족됐다.

### 조사에서 결정을 좌우한 사실들

1. **배관은 전 계층이 이미 열려 있다.** SDK 요청 타입 `PlaceBodyData.desc?: string`이 `place.create`·`place.update` 공통 body에 있고, 응답 `MySiteView.desc?: string`은 주석까지 `/** place introduction text (플레이스 소개 문구) */`다. `DomainPlace = CacheSiteView = MySiteView & …`라 도메인 타입도 상속으로 이미 갖고 있다.
2. **매퍼·캐시에 필드 화이트리스트가 없다.** `toDomainPlace`는 `...api` 스프레드고 로컬 캐시는 JSON 저장이다. 새 필드는 코드 변경 없이 통과·영속된다.
3. **막고 있던 것은 웹의 로컬 타입 하나뿐이었다.** `useUpdatePlace`의 `UpdatePlacePayload`가 `name`/`thumbnail`만 선언해 `desc`를 통과시키지 않았다. 앱 전체에서 `desc`를 읽거나 쓰는 코드는 0건이었다.
4. **`Textarea`는 카운터도 하드 캡도 의도적으로 없다.** 컴포넌트 주석이 "callers that need a hard cap clamp in `onChange`"라고 못 박고, `FeedbackPage`가 실제로 그렇게 쓴다. 100자 상한을 넣는 자리는 컴포넌트가 아니라 호출부다.
5. **ADR-0047의 relay 예외는 "데이터 부재"가 아니라 "기획 결정"이었다.** relay 기본플레이스(DoU 홈)에서 만든 날짜·소유자 행을 지운 것은 `createdAt`이 실제로 오는데도 내린 결정이다. 따라서 새 행이 그 예외를 자동 상속해야 할 이유가 없다 — 매번 따로 정해야 한다.

## 결정 (Decision)

### 1. 소개 문구는 정보·수정·허브 세 곳에 노출한다

- `PlaceDetailPage`(읽기): 이름 행 다음에 `InfoField` 한 행.
- `PlaceEditPage`(쓰기): 이름 필드 다음에 `Textarea` 한 필드. 오너 게이트는 화면 단위로 이미 걸려 있어 필드별 분기를 두지 않는다.
- `PlaceSettingsHubPage`: "플레이스 정보" 행의 `subtitle`로 한 줄 미리보기. `ListRow`가 `truncate`라 자르기 로직을 따로 두지 않는다.

### 2. 저장 경로는 `place.update` 하나뿐이며, 바뀐 필드만 싣는다

`updatePlace({ id, sid, name, desc?, thumbnail? })`. `desc`는 dirty일 때만 실어, 이름만 고친 저장이 소개를 덮어쓰지 않게 한다. 이는 `thumbnail`이 이미 따르던 규칙과 같다.

**빈 문자열은 "안 바꿈"이 아니라 "지움"이다.** 입력을 비우고 저장하면 `desc: ''`가 실제로 전송된다. `...(isDescDirty && { desc })`는 `desc`가 `''`여도 `isDescDirty`가 참이면 실리므로 이 구분이 성립한다.

### 3. 값이 없으면 행을 그리지 않는다 — 빈 문자열도 없음으로 친다

ADR-0047이 세운 "서버가 주지 않은 사실은 그리지 않는다"를 그대로 잇는다. 라벨만 남은 빈 행도, 플레이스홀더 `-`도 두지 않는다. `desc: ''`는 falsy라 이 규칙에 자연히 걸린다 — 지운 소개와 애초에 없던 소개가 같은 화면이 된다.

### 4. relay 기본플레이스(DoU 홈)에도 노출한다 — 만든 날짜·소유자와 갈린다

ADR-0047이 relay에서 지운 두 행과 **다르게** 간다. 그 둘은 "누가 언제 만든 남의 공간인가"에 답하는 행이라 시스템 사이트에서 무의미했지만, 소개 문구는 공간이 자기를 설명하는 글이라 DoU 홈에서도 뜻이 있다. 따라서 `isHomePlace` 분기를 걸지 않고 값 유무로만 판단한다.

실무적 결과: relay 기본플레이스는 편집 진입 경로가 없어 당장은 값이 채워질 길이 없다. 그래도 분기를 넣지 않는다 — 값이 생기는 날 코드를 다시 고치지 않기 위해서다.

### 5. 상한은 100자, 클램프는 호출부에서 한다

`Textarea`의 설계(사실 4)를 존중해 `onChange`에서 `slice(0, 100)`한다. 화면에서 카운터를 임기응변으로 그리지 않는다 — 디자인이 카운터를 요구하면 `Textarea`에 opt-in prop을 추가한다(컴포넌트 주석이 그 확장을 예고해 뒀다).

박스 높이는 기본 198px 대신 96px로 낮춘다. 198px은 피드백 폼의 5000자용 값이라 100자에는 과하다.

### 범위 밖 (Out of scope)

- **플레이스 생성 시 소개 입력.** `PlaceCreateRequestData`도 `desc`를 받지만 `CreatePlaceDialog`·`SetupWizardPage`는 손대지 않는다. 생성 흐름은 입력 항목을 늘릴수록 이탈이 커지는 자리라 별도 판단이 필요하다.
- 홈 플레이스 목록·전환 UI에서의 소개 노출.
- `apps/mobile`·`desktop-web` 변경 — 웹 화면만 다룬다.
- 서버측 길이·금칙어 검증. 클라이언트 클램프만 둔다.

## 대안 (Alternatives)

**소개를 `TextField`로 받는다** — `maxLength`만 주면 "N/100" 카운터가 공짜로 나온다. 그러나 단행 입력이라 100자가 한 줄로 흐르고, 줄바꿈을 못 넣는다. 소개는 문장이지 이름이 아니라서 기각.

**relay 기본플레이스에서도 숨긴다** — ADR-0047의 relay 예외와 모양을 맞출 수 있다. 그러나 그 예외의 근거(소유·생성 사실이 시스템 사이트에 무의미)가 소개 문구에는 적용되지 않는다. 모양의 일관성을 위해 근거 없는 분기를 추가하는 셈이라 기각.

**빈 소개를 "소개가 없어요" 안내로 채운다** — 오너에게 "여기를 채울 수 있다"는 신호가 된다. 그러나 정보 화면은 읽기 전용이라 그 자리에서 채울 수단이 없고, 비오너에게는 채울 권한도 없다. 만든 날짜·소유자 행의 규칙과도 어긋나 기각. 채우도록 유도하려면 정보 화면이 아니라 허브·홈에서 할 일이다.

**`ADR-0047` 본문을 고쳐 배제 문구만 지운다** — 가장 적은 변경이다. 그러나 Accepted ADR의 과거 결정을 지우면 "왜 한때 뺐었는가"라는 기록이 사라진다. ADR-0012 → ADR-0020 개정이 이 리포의 선례라 그 형식을 따른다.

## 결과 (Consequences)

- ADR-0047은 유효하되 §범위의 `desc` 문장만 이 ADR로 대체된다. 그 문서에 개정 링크를 남긴다.
- `place-settings.md`의 제외 목록에서 해당 항목을 걷어내고 포함·시나리오로 옮긴다. 코드만 바꾸고 두면 문서가 거짓말이 된다.
- `PlaceEditPage`에 처음으로 테스트가 생긴다(`PlaceEditPage.test.tsx`). 시드·dirty·클램프·페이로드 구성이 회귀 대상이 된다.
- **미검증 가정 2건이 남는다** — (1) `user.mysite`(목록) 응답이 `desc`를 실어 주는지. ADR-0047에서 `ownerId`·`isOwner`가 relay/cloud로 갈린 전례가 있어 타입 선언만으로는 단정할 수 없다. 목록에 없으면 `place.get`이 채우는지까지 확인해야 한다. (2) 부분 페이로드(`{ id, name, desc }`)가 서버에서 `thumbnail`을 지우지 않는지. 둘 다 서버를 붙여야 확인되며, 확인 결과는 `place-settings.md` §실측에 적는다.
