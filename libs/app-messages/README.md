# app-messages

This library was generated with [Nx](https://nx.dev).

# Web-Driven Interface

- **Web**: 앱의 상태를 관리하고, 필요할 때 네이티브 기능을 **요청**합니다.
- **Native**: 웹의 요청을 수행하고 결과를 **응답**하거나, 시스템 상태 변화를 **동기화**하여 웹에 전달합니다.

## Flow

- **Request (Web → App)**: 웹이 네이티브 기능(토큰 요청, UI 제어 등)을 실행하기 위해 메시지를 보냅니다.
- **Response (App → Web)**: 앱이 요청된 작업을 수행하고 결과를 돌려줍니다. (주의: 비동기 처리)
- **Event Push (App → Web)**: 시스템 이벤트(알림 수신, 뒤로가기 등)가 발생하면 앱이 웹에게 능동적으로 알립니다.

---

# Web to App (Request)

웹에서 네이티브 기능을 실행하기 위해 보내는 메시지 규약입니다.

### Device & System

| Message Type            | Payload (Data Example)                                     | Description                                            | Expected Response           |
| :---------------------- | :--------------------------------------------------------- | :----------------------------------------------------- | :-------------------------- |
| `CloseModal`            | -                                                          | 현재 열려있는 바텀 시트나 모달을 닫습니다.             | `OnCloseModal`              |
| `OpenModal`             | `{ url: '...', type: 'sheet', dragHandle: true }`          | 특정 URL을 네이티브 모달/시트로 엽니다.                | -                           |
| `OpenSettings`          | -                                                          | 기기의 앱 설정 화면으로 이동합니다.                    | -                           |
| `OpenShareSheet`        | `{ url: '...', title: '...' }`                             | OS 시스템 공유 시트를 엽니다. (iOS는 url/message 택 1) | `OnOpenShareSheet`          |
| `OpenDocument`          | `{ allowMultiSelection: true, type: ['application/pdf'] }` | 디바이스 파일 선택기를 엽니다.                         | `OnOpenDocument`            |
| `OpenCamera`            | `{ mediaType: 'photo', quality: 0.8 }`                     | 네이티브 카메라를 실행합니다.                          | `OnOpenCamera`              |
| `OpenPhotoLibrary`      | `{ selectionLimit: 5, mediaType: 'mixed' }`                | 네이티브 사진첩(갤러리)을 엽니다.                      | `OnOpenPhotoLibrary`        |
| `FetchDeviceInfo`       | -                                                          | 디바이스 고유 정보 및 버전을 요청합니다.               | `OnUpdateDeviceInfo`        |
| `FetchSafeArea`         | -                                                          | 기기의 노치 등 Safe Area 정보를 요청합니다.            | `OnFetchSafeArea`           |
| `FetchBackgroundStatus` | -                                                          | 앱의 현재 포그라운드/백그라운드 상태를 요청합니다.     | `OnBackgroundStatusChanged` |
| `RequestPermission`     | `{ permission: 'CAMERA' }`                                 | 특정 네이티브 시스템 권한을 요청합니다.                | `OnRequestPermission`       |
| `OpenURL`               | `{ url: 'https://...' }`                                   | 기기 기본 브라우저나 외부 앱으로 URL을 엽니다.         | -                           |

### Notification

| Message Type    | Payload (Data Example) | Description                           | Expected Response |
| :-------------- | :--------------------- | :------------------------------------ | :---------------- |
| `FetchFcmToken` | -                      | FCM 푸시 토큰 발급/갱신을 요청합니다. | `OnFetchFcmToken` |

### In-App Purchase (IAP)

| Message Type                 | Payload (Data Example)                     | Description                                           | Expected Response             |
| :--------------------------- | :----------------------------------------- | :---------------------------------------------------- | :---------------------------- |
| `FetchProducts`              | -                                          | 스토어에 등록된 구독 상품 목록을 요청합니다.          | `OnFetchProducts`             |
| `FetchCurrentPurchases`      | -                                          | 사용자가 보유 중인 현재 구독 내역을 요청합니다.       | `OnFetchCurrentPurchases`     |
| `Purchase`                   | `{ id: 'pro_monthly', offerToken: '...' }` | 특정 상품의 인앱 결제를 시작합니다.                   | `OnPurchaseSuccess` / `Error` |
| `FinishPurchaseTransaction`  | `{ purchase: { ... } }`                    | 서버 검증을 마친 영수증을 스토어에서 완료 처리합니다. | `OnFinishPurchaseTransaction` |
| `OpenSubscriptionManagement` | -                                          | 기기 OS에 맞는 스토어 구독 관리 페이지로 이동합니다.  | -                             |

### Cache

| Message Type        | Payload (Data Example)                        | Description                                             | Expected Response     |
| :------------------ | :-------------------------------------------- | :------------------------------------------------------ | :-------------------- |
| `FetchCache`        | `{ type: 'user', id: '123' }`                 | 로컬 캐시의 특정 단건 데이터를 요청합니다.              | `OnFetchCache`        |
| `FetchAllCache`     | `{ type: 'chat', query: {...}, meta: {...} }` | 특정 도메인의 다수/페이징 목록을 요청합니다.            | `OnFetchAllCache`     |
| `SaveCache`         | `{ type: 'user', id: '123', item: {...} }`    | 단일 데이터를 로컬 캐시에 저장(Upsert)합니다.           | `OnSaveCache`         |
| `SaveAllCache`      | `{ type: 'chat', items: [{...}, {...}] }`     | 다수의 데이터를 페이징 인덱싱과 함께 일괄 저장합니다.   | `OnSaveAllCache`      |
| `DeleteCache`       | `{ type: 'user', id: '123' }`                 | 로컬 캐시의 특정 단건 데이터를 삭제합니다.              | `OnDeleteCache`       |
| `DeleteAllCache`    | `{ type: 'chat', ids: ['1', '2'] }`           | 로컬 캐시의 다수 데이터를 일괄 삭제합니다.              | `OnDeleteAllCache`    |
| `ClearCache`        | `{ type: 'chat' }`                            | 특정 도메인의 캐시 테이블을 완전히 초기화합니다.        | `OnClearCache`        |
| `SearchGlobalCache` | `{ keyword: 'hello' }`                        | 다중 도메인(채널, 채팅 등) 대상 전역 검색을 실행합니다. | `OnSearchGlobalCache` |

### Preference & Auth

| Message Type       | Payload (Data Example)            | Description                    | Expected Response    |
| :----------------- | :-------------------------------- | :----------------------------- | :------------------- |
| `FetchPreference`  | `{ key: 'theme' }`                | 앱 로컬 설정 값을 요청합니다.  | `OnFetchPreference`  |
| `SavePreference`   | `{ key: 'theme', value: 'dark' }` | 앱 로컬 설정 값을 저장합니다.  | `OnSavePreference`   |
| `DeletePreference` | `{ key: 'theme' }`                | 앱 로컬 설정 값을 삭제합니다.  | `OnDeletePreference` |
| `OAuthLogin`       | `{ provider: 'google' }`          | 소셜 로그인 인증을 요청합니다. | `OnOAuthLogin`       |
| `OAuthLogout`      | `{ provider: 'google' }`          | 소셜 로그아웃을 요청합니다.    | `OnOAuthLogout`      |

---

# App to Web (Response & Event)

앱에서 요청에 대한 **결과**를 전달하거나, 시스템 상태 변화에 따른 이벤트를 웹으로 **푸시(Push)**하는 메시지 규약입니다.

### Device & System

| Message Type                | Description                                  | Data Structure (Example)                                |
| :-------------------------- | :------------------------------------------- | :------------------------------------------------------ |
| `OnUpdateDeviceInfo`        | 기기 정보 및 버전 정보 전달                  | `{ device: {...}, version: {...} }`                     |
| `OnFetchSafeArea`           | Safe Area(노치 등) 갱신 시 전달              | `{ safeArea: { top: 47, bottom: 34, ... } }`            |
| `OnBackgroundStatusChanged` | 앱이 백그라운드/포그라운드로 진입할 때 전달  | `{ status: 'background', isForeground: false, ... }`    |
| `OnCloseModal`              | 모달/바텀시트가 닫혔을 때 전달               | -                                                       |
| `OnOpenShareSheet`          | 공유 시트 액션이 완료/취소되었을 때 전달     | `{ action: 'sharedAction' }`                            |
| `OnBackPressed`             | 네이티브 물리적 뒤로가기 제스처 발생 시 전달 | -                                                       |
| `OnOpenDocument`            | 파일 선택기에서 선택된 문서 목록 전달        | `{ documents: [{ uri: '...', name: 'file.pdf' }] }`     |
| `OnGetContacts`             | 권한 획득 후 주소록 연락처 목록 전달         | `{ contacts: [{ recordID: '1', displayName: '...' }] }` |
| `OnOpenCamera`              | 카메라로 촬영된 미디어 에셋 전달             | `{ assets: [{ uri: '...', width: 100, ... }] }`         |
| `OnOpenPhotoLibrary`        | 갤러리에서 선택된 미디어 에셋 전달           | `{ assets: [{ uri: '...', width: 100, ... }] }`         |
| `OnRequestPermission`       | 시스템 권한 요청 허용/거부 결과 전달         | `{ permission: 'CAMERA', status: 'GRANTED' }`           |
| `OnReceiveAppLog`           | 네이티브 레벨의 에러나 로그를 웹으로 포워딩  | `{ log: { level: 'error', message: '...' } }`           |

### Notification

| Message Type            | Description                                      | Data Structure (Example)                                |
| :---------------------- | :----------------------------------------------- | :------------------------------------------------------ |
| `OnFetchFcmToken`       | FCM 토큰이 성공적으로 발급/갱신되었을 때         | `{ token: 'ey...' }`                                    |
| `OnReceiveNotification` | 앱이 **Foreground** 상태일 때 푸시 수신 시       | `{ notification: { title: '...', body: '...' } }`       |
| `OnOpenNotification`    | 유저가 **푸시 알림을 클릭**하여 앱에 진입했을 때 | `{ notification: { data: { type: 'chat', id: '1' } } }` |

### In-App Purchase (IAP)

| Message Type                  | Description                                | Data Structure (Example)                                     |
| :---------------------------- | :----------------------------------------- | :----------------------------------------------------------- |
| `OnFetchProducts`             | 스토어의 결제 가능 상품 목록 반환          | `{ products: [{ id: 'pro_monthly', displayPrice: '...' }] }` |
| `OnFetchCurrentPurchases`     | 사용자의 현재 활성화된 구독/구매 현황 반환 | `{ purchases: [{ productId: '...', ... }] }`                 |
| `OnPurchaseSuccess`           | 결제 트랜잭션 성공 및 영수증 원본 반환     | `{ purchase: { transactionId: '...', ... } }`                |
| `OnPurchaseError`             | 결제 실패 또는 사용자 취소 에러 반환       | `{ error: { code: 'E_USER_CANCELLED', ... } }`               |
| `OnFinishPurchaseTransaction` | 영수증 완료(Finish) 처리 결과 반환         | `{ purchase: { transactionId: '...', ... } }`                |

### Cache

| Message Type          | Description                                 | Data Structure (Example)                               |
| :-------------------- | :------------------------------------------ | :----------------------------------------------------- |
| `OnFetchCache`        | 단건 캐시 조회 결과 반환 (없으면 null)      | `{ type: 'user', id: '123', item: {...} }`             |
| `OnFetchAllCache`     | 다수/페이징 캐시 목록 반환                  | `{ type: 'chat', items: [{...}, {...}], meta: {...} }` |
| `OnSaveCache`         | 단건 캐시 데이터 저장 완료                  | `{ type: 'user', id: '123', success: true }`           |
| `OnSaveAllCache`      | 다수 캐시 데이터 저장 완료 (성공한 ID 목록) | `{ type: 'chat', ids: ['1', '2'], success: true }`     |
| `OnDeleteCache`       | 단건 캐시 데이터 삭제 완료                  | `{ type: 'user', id: '123', success: true }`           |
| `OnDeleteAllCache`    | 다수 캐시 데이터 삭제 완료                  | `{ type: 'chat', ids: ['1', '2'], success: true }`     |
| `OnClearCache`        | 캐시 초기화 완료 여부 반환                  | `{ type: 'chat', success: true }`                      |
| `OnSearchGlobalCache` | 다중 도메인 통합 검색 결과 반환             | `{ items: [{ ... }] }`                                 |

### Preference & Auth

| Message Type         | Description                               | Data Structure (Example)                             |
| :------------------- | :---------------------------------------- | :--------------------------------------------------- |
| `OnFetchPreference`  | 로컬 설정 값 조회 결과 반환               | `{ key: 'theme', value: 'dark' }`                    |
| `OnSavePreference`   | 로컬 설정 값 저장 성공 여부               | `{ key: 'theme', success: true }`                    |
| `OnDeletePreference` | 로컬 설정 값 삭제 성공 여부               | `{ key: 'theme', success: true }`                    |
| `OnOAuthLogin`       | 소셜 로그인 성공 결과 (실패/취소 시 null) | `{ result: { provider: 'google', idToken: '...' } }` |
| `OnOAuthLogout`      | 소셜 로그아웃 처리 완료 여부              | `{ success: true }`                                  |
