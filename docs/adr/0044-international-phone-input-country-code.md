# ADR-0044: 번호 입력에 국가를 도입하고 `countryCode`를 실제로 전송한다

> 상태: Accepted · 결정일: 2026-08-04
> 선행: [ADR-0033](./0033-relay-dm-invite-and-auth-parallel-tracks.md) · [ADR-0034](./0034-inviter-phone-verification-guest-gate-and-sheet.md) · [ADR-0042](./0042-account-linking-unified-path-migration.md) · [ADR-0043](./0043-relay-invite-cancel-reject-adoption.md)
>
> **범위 편차(2026-08-04, 이 브랜치에서 조정):** 원안(별도 브랜치 작업분)은 relay 1:1 초대 발급과
> 번호 인증 두 화면으로 범위를 한정했다. 클라우드 초대(`user.invite`/`user.invite-batch`)까지
> 넣고 싶다는 요청을 검토했으나, 백엔드 요청 타입에 `countryCode` 자리가 여전히 없어(직접 확인 —
> `chatic-backend-api`의 `MyUserInviteBody`·`asInviteBody`, `chatic-sockets-api`의
> `UserInviteRequestData`/`UserInviteBatchRequestData` 전부 무자리) 이번에도 제외한다. 아래
> 본문의 "제외" 절은 그대로 유효하다 — 클라우드 확장은 백엔드 후속 이후 별도 ADR로 다룬다.

## 맥락 (Context)

앱의 전화번호 입력은 전부 한국 번호를 전제한다. 검증은 `010/011/016/017/018/019` prefix와
10–11자리 길이로 고정돼 있고, 서버로 나가는 요청에 국가 정보가 없다.

**서버는 이미 준비돼 있다.** `auth.link-account`와 `invite.create` 둘 다 `countryCode?`를 받는다.
ISO alpha-2이고 미지정 시 `KR`이며, **발송과 증명에 같은 값을 보내야 같은 계정을 본다**
(원본: `chatic-sockets-api` `docs/specs/relay-server-invite/05-client-guide.md` §계약, Rev 2026-07-31).

**데이터 층도 이미 뚫려 있다.** `PhoneCodeSendOptions.countryCode` ·
`PhoneCodeProveOptions.countryCode`가 `AuthRemoteDataSource`에 선언돼 패킷까지 전달되고
(`libs/data/src/data/remote/data-sources/AuthRemoteDataSource.ts:41,53,145,160`),
`AuthRepositoryV2`가 통과시키며, `useLinkAccount`의 `PhoneCodeProveArgs`에도 자리가 있다.
`AuthRemoteDataSource.test.ts:152`에는 `countryCode: 'JP'` 케이스까지 들어 있다.

**끊긴 곳은 UI 층 하나다.** `usePhoneVerify`가 `send`/`verify`/`confirm` 어디에도 값을 넣지
않아(`apps/web/src/app/features/auth/hooks/usePhoneVerify.ts:195,227,301,325`) 실제 호출은 항상
서버 기본값 `KR`로 처리된다. `invite.create` 쪽은 `useRelayInvites`가 입력 타입을
`{ phone, name }`으로 좁혀 두어 값을 넣는 것 자체가 막혀 있다(`apps/web/src/app/hooks/useRelayInvites.ts:76,93`).

부수적으로, auth 쪽 유틸 사본에는 `normalizeKoreanPhone`이 빠져 있어 **지금도 `+82…` 형태를
붙여넣으면 검증에 실패한다**(`apps/web/src/app/features/auth/utils/phone.ts`).

### 제약

- **backend-api는 이번에 건드리지 않는다.** relay-server-invite `00-requirement.md`의 명시적 비목표다.
- **cloud 초대 경로에는 국가 자리가 아예 없다.** `user.invite` · `user.invite-batch`의 요청 타입에
  `countryCode` 필드가 없다. 서버가 먼저 움직여야 한다.
- **초대에 국가가 실려 오지 않는다.** `MyInviteView`에 `countryCode`가 없어
  (`@lemoncloud/chatic-backend-api` `dist/view/types.d.ts:108`) 수락 화면은 그 초대가 어느
  국가 번호로 발급됐는지 알 수 없다.
- **디바이스 region을 알 수 없다.** 앱 브리지에 locale/region 채널이 없다
  (`libs/app-messages` `system.ts:111,117`의 `region`·`country`는 우편 주소 필드다).
  웹 쪽 단서는 `navigator.language`의 지역 서브태그뿐이다.
- `TextField`에 `leading` 슬롯이 없다(`libs/web-ui-kit/src/foundations/input/TextField.tsx`).

## 결정 (Decision)

### 1. 전 세계 번호를 지원하고, 검증은 `libphonenumber-js`에 맡긴다

국가별 유효 길이·번호 유형·`AsYouType` 포맷을 직접 유지하지 않는다. 라이브러리가 돌려주는
국가 코드가 backend의 `CountryCode`와 같은 ISO alpha-2라 **dial code ↔ 국가 매핑 테이블을
우리가 들고 있을 필요가 없어진다.** 이것이 자체 테이블 안을 버린 결정적 이유다.

국가 **이름**은 라이브러리에 없다. `Intl.DisplayNames`로 기존 ko/en i18n에 얹어 번들 추가 없이 해결한다.

`@lemoncloud/chatic-backend-api`의 `CountryCode` LUT는 **끌어오지 않는다.** relay-server-invite
`02-design.md` D4가 클라이언트로 나가는 타입을 외부 패키지에 얽지 말라고 못박은 항목이고,
그 판단은 앱 쪽에도 그대로 적용된다. 값의 최종 판정은 서버 `400`에 맡긴다.

### 2. 범위는 두 화면 — 번호 인증과 relay 초대 발급

| 화면                                     | 패킷                | 포함               |
| ---------------------------------------- | ------------------- | ------------------ |
| `PhoneVerifyScreen` · `PhoneVerifySheet` | `auth.link-account` | ○                  |
| `ContactInvitePage`                      | `invite.create`     | ○                  |
| `AddFriendSheet` · `channels/InvitePage` | `user.invite`       | ✕ 서버에 자리 없음 |
| `desktop-web` `InviteDialog`             | `user.invite`       | ✕ 같은 이유        |

**발급과 수락을 같이 옮기는 것이 이 범위의 핵심이다.** 인증 화면에만 국가를 붙이면 KR로 만든
초대를 다른 국가로 인증하는 순간 번호가 어긋난다. `useRelayInvites`의 좁힌 입력 타입도 함께 푼다.

### 3. 국가 선택 UI — 필드 안 왼쪽 버튼 + 검색 시트

`TextField`에 `leading` 슬롯을 추가하고 거기에 국기·dial code·caret을 담은 버튼을 넣는다.
Figma "General Input"의 한 줄 구조가 유지되고 ui-kit 변경은 이 한 건으로 끝난다.

국가가 250개이므로 선택 시트는 **검색을 갖춘 새 컴포넌트**다. 기존
`LanguageSelectSheet`(2개 나열)는 본보기가 되지 못한다.

### 4. 기본 국가는 `마지막 선택 → locale → 빈 박스`

1. localStorage에 남은 직전 선택
2. `navigator.language`의 지역 서브태그(`ko-KR` → `KR`)
3. 둘 다 없으면 **빈 상태로 두고 사용자가 고르게 한다**

사용자가 명시적으로 고른 값이 가장 강한 신호이므로 locale보다 앞선다. 해외 거주자가
한국어 기기를 써도 한 번만 고치면 유지된다.

**빈 상태는 정식 상태다.** 국가가 없으면 번호를 검증할 수 없으므로 `인증 요청`이 비활성이다.
에러 문구가 아니라 비활성으로 표현한다 — 사용자가 아직 아무것도 틀리지 않았다.

### 5. wire에는 E.164를 통째로 보내고, `countryCode`는 덤으로 얹는다

**정정(2026-08-05, 이 브랜치에서 조정):** 원안은 `05-client-guide.md` §계약의 문면 —
"`countryCode`는 로컬(`0…`) 번호의 기본 국가" — 을 그대로 따라 로컬 형태 + `countryCode`를
택했다. 그런데 `chatic-backend-api`의 실제 구현(`src/lib/auth/hash-alias.ts` `asE164Phone`)을
직접 추적한 결과, `countryCode`는 번호가 `0`으로 시작할 때만 읽히고, `+`로 시작하면 그 즉시
`countryCode`를 완전히 무시한 채 그 문자열을 그대로 E.164로 받아들인다. 즉 로컬 형태 +
`countryCode` 조합은 `formatNational()`이 국가마다 다른 트렁크 규칙(선행 0 유무 — 예:
NANP `+1`은 자릿수만 다르고 `0`이 붙지 않는다)에 기대는 조합이라, **국가에 따라 서버가 `+`도
`0`도 아닌 문자열을 받아 400을 던지는 경우가 실제로 존재한다**(직접 검증: `US`·`CA`·`CN`·
`BR`·`ES` 등 245개국 중 139개국이 `formatNational()`에 선행 0이 없다). E.164를 통째로
보내면 `countryCode`의 존재 여부와 무관하게 항상 올바르게 파싱된다 — `countryCode`는
계속 실어 보내되(계약이 명시한 필드이고, 보내서 해로울 것이 없다) 서버가 실제로 쓰는 값은
E.164 쪽이 된다.

`libphonenumber-js`의 `parsed.number`(E.164, `+` 포함)를 그대로 보낸다. **기존 KR 사용자도
wire 값이 바뀐다** — `01012345678` → `+821012345678`. last4 대조(결정 6, `inviteLast4`)는
뒤 4자리 비교라 영향받지 않는다.

**발송과 증명에 같은 국가를 보내는 것은 계약이다.** 국가는 번호와 같은 생명주기로 다룬다 —
국가를 바꾸면 발송된 코드를 무효화한다(지금 번호를 고치면 `expiredAt`을 날리는 것과 같은 처리).
이는 wire 형태를 E.164로 바꾼 뒤에도 그대로 유효하다 — 국가가 바뀌면 E.164 자체가 달라진다.

### 6. KR을 전제한 주변 로직 둘을 함께 고친다

- **`"maskedPhone": "010-\*\***-{{last4}}"`** — ko/en 양쪽에 `010-`이 리터럴로 박혀 있다.
  해외 번호 초대에서 존재하지 않는 국번을 표시한다. 국가에 중립적인 표현으로 바꾼다.
- **`useSentInviteLog`의 키** — KR 정규화 digits 기준이라 해외 번호는 키가 어긋나 재발급 기억이
  깨진다. E.164를 키로 쓴다. 기존 키는 마이그레이션하지 않고 자연 소멸시킨다(로컬 편의 캐시일 뿐이다).

`inviteLast4` 대조(`usePhoneVerify.ts:188`)는 **고치지 않는다.** 뒤 4자리 비교라 국가가 달라도
오작동하지 않고, 오탐이 늘 뿐이며 최종 판정은 서버가 한다.

### 7. 새 유틸은 이번 두 화면에만 붙인다

`libphonenumber-js` 기반 공용 유틸을 새로 만들고 `PhoneVerify*`와 `ContactInvitePage`만 옮긴다.
KR 전용 사본 셋(`auth/utils/phone.ts` · `channels/utils/koreanPhone.ts` · desktop `InviteDialog`
파일 내 사본)과 네 번째 상수 사본(`AddFriendSheet.tsx:53`)은 **그대로 둔다.** cloud 경로는 서버가
국가를 못 받으므로 옮겨도 얻는 것이 없고, 회귀 면적만 늘어난다. 중복 정리는 별건으로 남긴다.

## 대안 (Alternatives)

**지원 국가를 몇 개국으로 좁히고 자체 테이블을 든다.** 번들이 늘지 않지만 국가가 늘 때마다
`{dialCode, 길이 범위}`를 손으로 유지해야 하고, 국가별 번호 유형(모바일/유선) 구분이 불가능하다.
전 세계 지원을 택한 이상 성립하지 않는다.

**국가 목록만 전부 보여 주고 검증은 서버에 위임한다.** 클라이언트 코드가 가장 작지만 잘못된 번호가
발송 일일 제한(번호당 10회, 기기당 20회)을 헛쓴다. 사전 검증이 이 제한을 지키는 장치다.

**`+82` 접두만 시각적으로 붙인다.** 요청의 문자적 해석이지만 해외 번호를 실제로 지원하지 못한다.

**선택 UI 없이 E.164를 통째로 입력받는다.** wire 형태(결정 5 정정 이후)와는 더 이상 어긋나지
않지만, 입력 UX까지 E.164로 바꾸면 국내 사용자가 `010`으로 치던 습관을 깨거나 붙여넣기 전용
병행 처리가 필요해진다. 입력은 로컬 형태를 유지하고 wire 직전에만 E.164로 변환하는 지금 방식이
UX 변경 없이 같은 정확성을 얻는다.

**국가 선택을 번호 필드와 분리된 별도 줄로 둔다.** ui-kit을 안 고쳐도 되지만 화면이 길어지고
Figma의 한 줄 구조에서 벗어난다. `leading` 슬롯 하나가 더 싸다.

**locale을 마지막 선택보다 우선한다.** 디바이스 설정을 진실로 보지만 사용자가 고친 값이 매번
덮인다. 명시적 선택이 더 강한 신호다.

**세 벌의 KR 유틸을 이번에 전부 통합한다.** 중복은 사라지지만 cloud 초대·연락처 가져오기·
desktop까지 회귀 면적이 번지고, 그 경로들은 국가를 못 쓴다.

## 결과 (Consequences)

**얻는 것**

- 해외 번호로 가입·로그인·초대가 가능해진다.
- `+82…` 붙여넣기가 auth 화면에서도 통한다 — 지금은 실패하는 입력이다.
- `countryCode`가 서버 기본값이 아니라 명시값으로 나간다. 서버가 기본값을 바꿔도 앱이 흔들리지 않는다.
- 국가별 검증·포맷 규칙의 유지 책임이 라이브러리로 넘어간다.

**감수하는 것**

- **번들이 늘어난다.** `libphonenumber-js` min 메타데이터 기준 약 30–40KB gzip. 앱 전체가 아니라
  번호 입력 화면에 코드 분할로 얹어 첫 진입 비용을 피한다.
- **수락자가 국가를 스스로 맞춰야 한다.** `MyInviteView`에 국가가 없어 수락 화면은 초대의 국가를
  알 수 없다. `inviteLast4`는 통과했는데 국가가 달라 서버에서 떨어지는 조합이 생긴다.
  완화책은 **불일치 에러 문구가 국가까지 짚어 주는 것** 하나뿐이다. 서버가 `MyInviteView`에
  `countryCode`를 실어 주면 수락 화면 기본값을 초대에 맞춰 잠글 수 있다 — 별건으로 요청한다.
- **번호 입력 경로가 두 갈래로 갈린다.** relay 경로는 국가를 알고 cloud 경로는 모른다. cloud 경로가
  서버 지원을 받을 때까지 유지되는 상태이며, 그때 유틸 통합과 함께 해소한다.
- **`Intl.DisplayNames` 의존.** 모던 브라우저와 WebView에는 있지만, 없으면 ISO 코드를 그대로
  보여 주는 폴백이 필요하다.
- **국가 선택이 로컬 상태로 하나 늘어난다.** localStorage에 남기므로 기기 간에는 공유되지 않는다.

## 후속 (Follow-ups)

- backend에 `user.invite` · `user.invite-batch`의 `countryCode` 지원을 요청한다.
- backend에 `MyInviteView.countryCode` 노출을 요청한다(수락 화면 기본값 고정용).
- KR 전용 유틸 세 벌 + 상수 사본 하나의 통합을 별건으로 정리한다.
