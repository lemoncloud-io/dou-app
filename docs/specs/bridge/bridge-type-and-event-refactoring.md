# SPEC: 하이브리드 앱-웹 브릿지 타입 리팩토링 및 이벤트 시스템 고도화

- **작성일**: 2026-06-01
- **상태**: 승인됨 (Approved) / 구현 완료
- **도메인**: 하이브리드 통신 브릿지 (`libs/app-messages`, `libs/bridges`)

---

## 1. 배경 및 필요성

기존 Chatic 하이브리드 브릿지 시스템의 `libs/app-messages` 패키지는 타입 정의 및 이벤트 수신 로직 상 몇 가지 복잡성과 비효율성을 안고 있었습니다:

1. **상태 관리 도구(Zustand) 의존성**: 앱 메시지 수신 및 분배를 전적으로 `useAppMessageStore` 전역 스토어에 의존하고 있어, 가벼운 통신 툴킷 패키지에 불필요한 전역 상태 관리 오버헤드와 런타임 메모리가 발생했습니다.
2. **`never` 타입 처리의 복잡성**: 데이터가 존재하지 않는 메시지에 대해 `never` 타입을 사용하면서, `WebDefaultMessage` 및 `AppDefaultMessage` 정의가 고도로 복잡한 조건부 유니온 타입(`extends never ? ...`)으로 작성되었습니다. 이는 외부 컴포넌트 호출 시 자동완성과 타입 추론의 정확성을 떨어뜨리는 주요 원인이 되었습니다.
3. **런타임 및 타입 스펙의 이원화**: 새로운 앱 메시지를 추가할 때 런타임용 객체인 `AppMessageTypes`와 타입 정의 맵인 `AppMessageDataMap` 두 군데에 동일한 키를 수동 동기화해야 하는 중복이 존재했습니다.
4. **이벤트 분류 타입의 복잡성**: Web 요청 없이 들어오는 단방향 이벤트를 분류하기 위해 도입된 `EventMessageType`이 일반 브릿지 통신 사양(`libs/bridges`)과 겹쳐 불필요한 제네릭 복잡성을 야기했습니다.

---

## 2. 구현 설계 및 변경 사항 (완료)

### 2.21 빈 페이로드 규격화 및 `{}` 객체 타입 적용을 통한 단순성 극대화

데이터가 존재하지 않는 메시지 페이로드에 대해 기존의 `never` 또는 강한 제약의 `Record<string, never>` 타입을 완전히 제거하고, 명시적인 빈 객체 타입 `{}` 형식으로 개선했습니다.

이 과정에서 복잡한 조건부 타입 유니온 식(`{} extends Payload ? { data?: Payload } ...`)을 완전히 배제하고, **"메시지 정의는 언제나 명확하게 data 필드가 존재하도록 단일 사양으로 일관성을 유지한다"**는 아키텍처적 의사결정을 적용했습니다.

- **가독성 및 IDE 가시성 해소**:
  기존에 `never`를 사용했을 때 개발 도구(IDE)에서 마우스 오버 시 `never`로만 추론되어 구체적인 타입 정의와 주석 명세가 일절 노출되지 않는 가독성 저하 문제를 완벽하게 해결했습니다. 이제 빈 객체 타입 `{}` 선언과 함께 주석이 고스란히 에디터 툴팁에 노출됩니다.
- **추후 입력 파라미터 추가를 위한 미래 확장성 대비**:
  사용자 요청이나 기획 사양의 추가로 미래에 특정 페이로드 필드가 확장될 가능성(예: `CloseModal`에 `animation?: boolean` 등 추가)에 유연하게 대응할 수 있도록 비어 있는 객체 스펙 `{}` 형태로 기본 정의했습니다:

    ```typescript
    /** [요청] 네이티브 바텀시트/모달 닫기 */
    export type CloseModalPayload = {
        // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
    };
    ```

- **공통 타입 파일의 극단적인 단순성 유지**:
  공통 타입 정의 파일(`app-message.ts`, `web-message.ts`)에 복잡한 조건부 3항 연산 식(`extends`, `never` 판별식 등)을 작성하지 않고, 언제나 `data` 속성이 필수로 요구되도록 가장 명료하고 일관된 단일 구조(`data: Payload`)로 정의하여 복잡성을 0으로 수렴시켰습니다:
    ```typescript
    export type WebDefaultMessage<T extends WebMessageType> = BaseMessage & {
        type: T;
        data: WebMessagePayloadMap[T]; // 100% 필수 및 일관된 구조 유지!
    };
    ```
- **빈 객체 주입 보장 및 명시적인 호출부 작성**:
  타입 구조 상 꼼수를 부려 `data`를 옵셔널하게 보이도록 처리하기보다, 정적 타입 무결성과 런타임 수신 모듈의 빈 객체 파싱 안전성을 100% 보장하기 위해 빈 페이로드 메시지를 송신할 때는 명시적으로 `{}`를 대입하여 보내도록 타입을 규정했습니다:
    ```typescript
    // 정적 컴파일 및 런타임 빈 객체 주입을 보장하는 명시적 호출 사양
    postMessage({ type: 'CloseModal', data: {} });
    ```

### 2.2. EventMessageType 완전 제거 및 AppMessage 단일 소스화

별도의 단방향 이벤트 타입이었던 `EventMessageType`을 완전히 삭제하고, 범용 `AppMessage` 및 `AppMessageType` 기반으로 브릿지 스펙을 단일화했습니다.

- **브릿지 제네릭 인터페이스 단순화**:
  `libs/bridges` 하위의 `IAppBridgeHost`, `AppBridgeHost`, `MockAppBridgeHost`, `IWebBridgeClient`, `WebBridgeClient` 내부의 모든 `pushEvent` 및 `onEvent` 시그니처가 `EventMessageType` 대신 범용 `AppMessageType`을 상속받도록 결합하여 제약 조건의 제네릭 복잡성을 완전히 걷어냈습니다:

    ```typescript
    // 수정 전
    pushEvent<K extends EventMessageType>(message: AppMessageData<K>): void;

    // 수정 후
    pushEvent<K extends AppMessageType>(message: AppMessageData<K>): void;
    ```

- **유연성 확보**: 단방향 이벤트뿐 아니라 모든 네이티브 앱 응답 메시지에 대해 유연하게 푸시 및 이벤트 청취가 가능한 범용적인 브릿지 통신 구조를 실현했습니다.

### 2.3. 타입 안정성 확보 및 외부 패키지 수정

- `apps/web` (6곳) 및 `apps/mobile` (5곳), `libs/bridges` (2곳)의 비규격 호출 코드를 일괄 리팩토링하여 전체 모노레포의 TypeScript 빌드 검증을 완벽히 통과시켰습니다.

---

## 3. 다음 스코프 개발 계획 (TODO)

다음 개발 주기에서는 **방안 A (전용 커스텀 훅 모듈화)**를 추진할 예정이며, 집중적으로 구현하고 웹 앱으로 배포됩니다.

### TODO 리스트:

- [ ] **도메인 전용 브릿지 이벤트 훅 정의**:
    - `libs/bridges` 내에 Web이 앱으로부터 수신받는 각 이벤트별 전용 훅을 추가 정의합니다.
    - 문자열 파라미터를 인자에서 완벽히 배제하고 호출의 직관성을 보장합니다.
    - **예시 사양**:

        ```typescript
        import { useHandleAppMessage, type AppMessageListener } from '@chatic/app-messages';

        export const useOnBackPressed = (handler: AppMessageListener<'OnBackPressed'>) =>
            useHandleAppMessage('OnBackPressed', handler);

        export const useOnGetContacts = (handler: AppMessageListener<'OnGetContacts'>) =>
            useHandleAppMessage('OnGetContacts', handler);
        ```

- [ ] **웹 컴포넌트 호출 리팩토링**:
    - `apps/web` 내에서 기존의 `useHandleAppMessage('OnGetContacts', ...)` 형태로 사용하던 모든 코드를 새로 설계된 전용 훅인 `useOnGetContacts(...)` 형태로 일괄 교체하여 타입 안정성을 최고 수준으로 격상시킵니다.
