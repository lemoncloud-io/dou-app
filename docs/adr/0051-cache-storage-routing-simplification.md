# ADR-0051: 캐시 저장소 전략 계층을 선언적 라우팅 테이블로 단순화

> 상태: Accepted · 결정일: 2026-08-12
> · [ADR-0030](0030-app-runtime-cold-db-migration-and-invite-cloud-recovery.md)의 2-tier 관련 결정을 대체
> · [ADR-0006](0006-chat-cache-quota-safety-net-and-author-names.md)의 chat 상한은 유지(주입 경로만 변경)

> **후속 (2026-08-13): 결정 4가 실행되어 없어졌다.** 아래 결정 4와 그 근거인 "desktop-web 수정
> 금지" 제약은 2026-08-13 사용자가 이번 건에 한해 제약을 풀면서 해소됐다. `setChatCacheLimit`
> 심은 **제거**됐고, desktop-web은 `configureDataRuntime`을 직접 호출한다. 같은 작업에서
> 시그니처를 객체형 `configureDataRuntime({ repositories?, cache? })`으로 바꿔 두 호출처가 각각
> 필요한 정책만 넘기도록 했다(호출은 병합됨). 즉 "대안"에서 기각했던 *`setChatCacheLimit` 즉시
> 제거 및 호출처 이전*이 하루 뒤 채택된 셈이다 — 기각 사유가 기술적 판단이 아니라 외부 제약이었기
> 때문이다.

## 맥락 (Context)

`libs/app-runtime`의 캐시 저장소 조립부가 데이터 레이어의 다른 팩토리들과 구조적으로 동떨어져
있다(갓모듈화). `remoteFactory`·`repositoryFactory`는 상태 없는 얇은 조립 함수인데,
`localFactory` + `cacheStorageStrategies`만 유일하게 다음을 안고 있다:

- **죽은 2-tier 기계.** 네이티브가 Cold(NativeDB/SQLite)-only로 전환된 뒤(커밋 `796aa3cf`,
  2026-07-27 — 2-tier의 cold-first 쓰기 게이트와 cold 미스→hot 폴백 부재가 채널·채팅 로드 실패로
  드러나 되돌린 것인데, 그 전환에는 ADR이 남지 않았다. 이 ADR이 그 공백을 함께 메운다)
  `HotColdCacheStorageStrategy`, `AppPolicyResolver`, hot-first/cold-first 정책표는 아무도
  생성하지 않는다. libs/data 쪽 짝인 `DynamicCacheStorage`·`defaultPolicies`·
  `dynamicCacheTypes`·eviction/capacity 서브시스템도 소비처가 `cacheStorageStrategies.ts`
  하나뿐이라 연쇄적으로 죽은 코드다.
- **세 겹으로 흩어진 라우팅 결정.** "이 타입은 어디에 저장되는가"의 답이
  ① `selectStrategy`(환경 감지) ② `HOT_ONLY_CACHE_TYPES` 핀(profile — 네이티브 Cold writer의
  uid 덮어쓰기 버그 우회) ③ `isNativeCacheTypeUsable`(핸드셰이크 게이트, 웹 선배포 스큐 방어)
  세 곳의 조합으로만 나온다.
- **모듈 레벨 뮤터블 상태 3개 + 부팅 순서 의존 세터.** `sharedStrategy`·`hotStrategy`·
  `chatCacheLimit` 메모와 `setChatCacheLimit`(런타임 마운트 전에 호출해야만 동작).

전제와 제약:

- 미커밋 WIP인 **nativeCacheSupport 핸드셰이크**(네이티브가 지원 캐시 타입·스키마 버전을
  `OnWebAppReady`로 보고)는 그대로 랜딩하며, 새 구조는 이 게이트를 라우팅 결정의 한 축으로
  통합한다.
- **완전 동작 불변.** 저장 위치·라우팅 결과·부팅 마이그레이션 경로가 모든 클라이언트
  (apps/web, admin-v2, desktop-web, 모바일 WebView)에서 지금과 동일해야 한다.
- **desktop-web은 수정 금지**(사용자 지시). `setChatCacheLimit`의 유일한 호출처가
  `apps/desktop-web/src/main.tsx`이므로 이 export는 당장 제거할 수 없다.
- ADR-0036(gateway 폐지·repository 승격) 데이터 레이어 리팩토링과 겹치지 않도록 **캐시 저장소
  계열만** 다룬다.

## 결정 (Decision)

1. **죽은 2-tier 기계를 삭제한다.**
    - app-runtime: `HotColdCacheStorageStrategy`, `AppPolicyResolver`, hot/cold 정책표, 그리고
      `CacheStorageStrategy` 인터페이스 기반 전략 패턴 자체를 폐지한다.
    - libs/data: `DynamicCacheStorage`, `defaultPolicies`, `dynamicCacheTypes`,
      eviction/capacity 서브시스템과 관련 barrel export를 제거한다.
    - `createWebInviteCloudStorage`(부팅 마이그레이션용 웹 리더, 옛 이름
      `createHotInviteCloudStorage`)는 `IndexedDBAdapter` 직결이라
      전략 계층과 무관하므로 **존치**한다.
2. **저장소 라우팅 결정을 선언적 테이블 하나로 모은다.** 타입별로
   환경(`isNativeApp`) × 핸드셰이크(`isNativeCacheTypeUsable`) × 타입 핀(`profile` hot 고정)을
   한 곳에서 판정하는 `web | native` 결정 함수/테이블을 두고, 각 핀·게이트의 사유를 테이블
   항목에 문서화한다. read-policy(hot-first/cold-first) 개념은 계층 소멸로 의미가 없어졌으므로
   재설계하지 않고 폐기한다 — 남는 정책은 **라우팅 테이블과 chat 상한 둘뿐**이다.
3. **localFactory를 remoteFactory 결의 상태 없는 조립 함수로 재편한다.** chat 채널당 상한은
   데이터 런타임 조립 시점의 옵션으로 주입한다. 공유 `IndexedDBDatabase` 인스턴스는 물리 공유
   자원이므로 유일하게 남는 모듈 상태로 명시한다.
4. **`setChatCacheLimit`는 deprecated 호환 심으로 존치한다.** 내부적으로 새 옵션 경로에
   위임한다(desktop-web 수정 금지 제약 때문에 즉시 제거 불가). desktop-web이 새 경로로 이전되면
   심을 제거한다.
5. **검증은 동작 불변 증명에 집중한다.** 기존 `localFactory.test`·`public-surface.test`에 더해,
   환경 × 타입 × 핸드셰이크 조합별 라우팅 결과를 고정하는 테이블 테스트를 추가한다.

## 대안 (Alternatives)

- **전략 패턴 유지, 죽은 구현만 제거** — 남는 전략이 사실상 어댑터 직결 두 갈래뿐이라 추상화가
  비용만 남긴다. 기각.
- **2-tier 코드 보존(재배치만)** — 되살릴 계획이 없고 git 이력으로 복원 가능하다. 보존은
  "언젠가 쓸지도"라는 혼란만 유지시킨다. 기각.
- **app-runtime만 정리하고 libs/data는 보류** — 소비처 없는 서브시스템이 배럴에 남아 신규
  기여자를 계속 오도한다. 기각.
- **`setChatCacheLimit` 즉시 제거 및 호출처 이전** — desktop-web 수정 금지 제약과 충돌. 기각.

## 결과 (Consequences)

**얻는 것**

- 데이터 레이어 세 팩토리의 결이 통일된다(모두 상태 없는 조립 함수).
- "이 타입은 어디에 저장되는가"의 답이 한 곳에서 나오고, 핸드셰이크 게이트·profile 핀 같은
  예외가 테이블 항목으로 가시화된다. 신규 캐시 타입 추가 시 결정 지점이 1곳이 된다.
- libs/data의 public 표면이 줄어 ADR-0036 본 리팩토링의 부담이 감소한다.

**감수할 트레이드오프**

- 2-tier를 되살리려면 git 이력 발굴이 필요하다(현재 계획 없음).
- deprecated 심(`setChatCacheLimit`)이 desktop-web 이전 시까지 잔존한다.
- 삭제 규모가 커서 리뷰 부담이 있다 — 삭제 커밋과 재편 커밋을 분리해서 올린다.

**다음 단계**

- [[dev-2_implement]] Phase A: 이 ADR을 입력으로 스펙 작성(라우팅 테이블 형태, 삭제 대상 목록,
  테스트 매트릭스).
