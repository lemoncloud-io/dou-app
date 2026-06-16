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

| Message Type            | Payload (Data Example)                                                           | Description                                                                                  | Expected Response           |
| :---------------------- | :------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :-------------------------- |
| `CloseModal`            | -                                                                                | 현재 열려있는 바텀 시트나 모달을 닫습니다.                                                   | `OnCloseModal`              |
| `OpenModal`             | `{ url: '...', type: 'sheet', dragHandle: true, heightRatio: 0.9 }`              | 특정 URL을 네이티브 모달/시트로 엽니다.                                                      | `OnOpenModal`               |
| `OpenSettings`          | -                                                                                | 기기의 앱 설정 화면으로 이동합니다.                                                          | `OnOpenSettings`            |
| `OpenShareSheet`        | `{ title: '...', message: '...', url: '...' }`                                   | OS 시스템 공유 시트를 엽니다. (iOS는 url/message 택 1)                                       | `OnOpenShareSheet`          |
| `GetContacts`           | -                                                                                | 기기 주소록 연락처 목록 조회를 요청합니다.                                                   | `OnGetContacts`             |
| `OpenDocument`          | `{ allowMultiSelection: true, type: ['application/pdf'], includeBase64: false }` | 디바이스 파일 선택기를 엽니다.                                                               | `OnOpenDocument`            |
| `OpenCamera`            | `{ mediaType: 'photo', quality: 0.8, includeBase64: false, cameraType: 'back' }` | 네이티브 카메라를 실행합니다.                                                                | `OnOpenCamera`              |
| `OpenPhotoLibrary`      | `{ selectionLimit: 5, mediaType: 'mixed', quality: 0.8, includeBase64: false }`  | 네이티브 사진첩(갤러리)을 엽니다.                                                            | `OnOpenPhotoLibrary`        |
| `FetchSafeArea`         | -                                                                                | 기기의 노치 등 Safe Area 정보를 요청합니다.                                                  | `OnFetchSafeArea`           |
| `FetchBackgroundStatus` | -                                                                                | 앱의 현재 포그라운드/백그라운드 상태를 요청합니다.                                           | `OnBackgroundStatusChanged` |
| `RequestPermission`     | `{ permission: 'CAMERA' }`                                                       | 특정 네이티브 시스템 권한을 요청합니다.                                                      | `OnRequestPermission`       |
| `OpenURL`               | `{ url: 'https://...' }`                                                         | 기기 기본 브라우저나 외부 앱으로 URL을 엽니다.                                               | `OnOpenURL`                 |
| `SetCanGoBack`          | `{ canGoBack: true }`                                                            | 네이티브 뒤로가기 차단 여부를 설정합니다. `true` 설정 시 웹뷰 내부 라우팅을 우선 처리합니다. | `OnSetCanGoBack`            |
| `SendSms`               | `{ phoneNumbers: ['01012345678'], message: '...' }`                              | 디바이스 기본 SMS 앱을 열어 문자 전송을 요청합니다. (다중 수신자 지원)                       | `OnSendSms`                 |
| `FetchAppIcon`          | -                                                                                | 현재 적용된 앱 아이콘 key를 요청합니다.                                                      | `OnFetchAppIcon`            |
| `FetchAppIconList`      | -                                                                                | 앱에서 선택 가능한 아이콘 목록을 요청합니다.                                                 | `OnFetchAppIconList`        |
| `ChangeAppIcon`         | `{ iconName: 'WhiteIcon' }`                                                      | 앱 아이콘 변경을 요청합니다. 기본 아이콘은 `null`.                                           | `OnChangeAppIcon`           |

### Notification

| Message Type      | Payload (Data Example) | Description                                           | Expected Response   |
| :---------------- | :--------------------- | :---------------------------------------------------- | :------------------ |
| `FetchFcmToken`   | -                      | FCM 푸시 토큰 발급/갱신을 요청합니다.                 | `OnFetchFcmToken`   |
| `FetchBadgeCount` | -                      | 앱의 현재 네이티브 뱃지 카운트 조회를 요청합니다.     | `OnFetchBadgeCount` |
| `SetBadgeCount`   | `{ count: 5 }`         | 앱의 네이티브 뱃지 카운트를 지정된 숫자로 설정합니다. | `OnSetBadgeCount`   |

### In-App Purchase (IAP)

| Message Type                 | Payload (Data Example)                     | Description                                                     | Expected Response              |
| :--------------------------- | :----------------------------------------- | :-------------------------------------------------------------- | :----------------------------- |
| `FetchProducts`              | -                                          | 스토어에 등록된 구독 상품 목록을 요청합니다.                    | `OnFetchProducts`              |
| `FetchCurrentPurchases`      | -                                          | 사용자가 보유 중인 현재 구독 내역을 요청합니다.                 | `OnFetchCurrentPurchases`      |
| `Purchase`                   | `{ id: 'pro_monthly', offerToken: '...' }` | 특정 상품의 인앱 결제를 시작합니다. (Android는 offerToken 필수) | `OnPurchaseSuccess` / `Error`  |
| `FinishPurchaseTransaction`  | `{ purchase: { ... } }`                    | 서버 검증을 마친 영수증을 스토어에서 완료 처리합니다.           | `OnFinishPurchaseTransaction`  |
| `OpenSubscriptionManagement` | -                                          | 기기 OS에 맞는 스토어 구독 관리 페이지로 이동합니다.            | `OnOpenSubscriptionManagement` |

### CacheData

| Message Type            | Payload (Data Example)                                                              | Description                                             | Expected Response         |
| :---------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------ | :------------------------ |
| `FetchCacheData`        | `{ type: 'user', id: '123', cid: '...', uid: '...' }`                               | 로컬 캐시의 특정 단건 데이터를 요청합니다.              | `OnFetchCacheData`        |
| `FetchAllCacheData`     | `{ type: 'chat', cid: '...', uid: '...', query: { channelId: 'ch_1', limit: 20 } }` | 목록 조회 (상위 ID와 페이징을 query에 통합)             | `OnFetchAllCacheData`     |
| `SaveCacheData`         | `{ type: 'user', id: '123', cid: '...', uid: '...', item: {...} }`                  | 단일 데이터를 로컬 캐시에 저장(Upsert)합니다.           | `OnSaveCacheData`         |
| `SaveAllCacheData`      | `{ type: 'user', cid: '...', uid: '...', items: [...], query: { limit: 100 } }`     | 일괄 저장 및 인덱싱 처리                                | `OnSaveAllCacheData`      |
| `DeleteCacheData`       | `{ type: 'user', id: '123', cid: '...', uid: '...' }`                               | 로컬 캐시의 특정 단건 데이터를 삭제합니다.              | `OnDeleteCacheData`       |
| `DeleteAllCacheData`    | `{ type: 'chat', cid: '...', uid: '...', ids: ['1', '2'] }`                         | 로컬 캐시의 다수 데이터를 일괄 삭제합니다.              | `OnDeleteAllCacheData`    |
| `ClearCacheData`        | `{ type: 'chat', cid: '...', uid: '...' }`                                          | 특정 도메인의 캐시 테이블을 완전히 초기화합니다.        | `OnClearCacheData`        |
| `SearchGlobalCacheData` | `{ keyword: 'hello', cid: '...', uid: '...' }`                                      | 다중 도메인(채널, 채팅 등) 대상 전역 검색을 실행합니다. | `OnSearchGlobalCacheData` |

### Preference & Auth

| Message Type       | Payload (Data Example)            | Description                                            | Expected Response    |
| :----------------- | :-------------------------------- | :----------------------------------------------------- | :------------------- |
| `FetchPreference`  | `{ key: 'theme' }`                | 앱 로컬 설정 값을 요청합니다.                          | `OnFetchPreference`  |
| `SavePreference`   | `{ key: 'theme', value: 'dark' }` | 앱 로컬 설정 값을 저장합니다.                          | `OnSavePreference`   |
| `DeletePreference` | `{ key: 'theme' }`                | 앱 로컬 설정 값을 삭제합니다.                          | `OnDeletePreference` |
| `OAuthLogin`       | `{ provider: 'google' }`          | 소셜 로그인 인증을 요청합니다. (`'google' \| 'apple'`) | `OnOAuthLogin`       |
| `OAuthLogout`      | `{ provider: 'google' }`          | 소셜 로그아웃을 요청합니다.                            | `OnOAuthLogout`      |

### Log & Common & Others

| Message Type            | Payload (Data Example)                                                           | Description                                   | Expected Response         |
| :---------------------- | :------------------------------------------------------------------------------- | :-------------------------------------------- | :------------------------ |
| `WebAppReady`           | -                                                                                | 웹앱 준비가 완료되었음을 네이티브에 알립니다. | -                         |
| `ShowLoader`            | -                                                                                | 네이티브 로딩 인디케이터를 보여줍니다.        | -                         |
| `HideLoader`            | -                                                                                | 네이티브 로딩 인디케이터를 숨깁니다.          | -                         |
| `SyncCredential`        | -                                                                                | 크레덴셜 동기화를 요청합니다.                 | -                         |
| `PopWebView`            | -                                                                                | 현재 웹뷰를 스택에서 팝(종료) 처리합니다.     | -                         |
| `SendLog`               | `{ level: 'error', tag: 'CHECKOUT', message: '...', data: {...}, error: {...} }` | Web 로그를 Native logger로 전달합니다.        | `OnSendLog`               |
| `FetchAppLogBuffer`     | `{ count: 20 }`                                                                  | 버퍼에서 앞쪽 로그를 조회합니다(제거 안 함).  | `OnFetchAppLogBuffer`     |
| `PollAppLogBuffer`      | `{ count: 20 }`                                                                  | 버퍼에서 앞쪽 로그를 조회하며 제거합니다.     | `OnPollAppLogBuffer`      |
| `ClearAppLogBuffer`     | -                                                                                | 로그 버퍼를 전체 비웁니다.                    | `OnClearAppLogBuffer`     |
| `FetchAppLogBufferSize` | -                                                                                | 현재 로그 버퍼 크기를 조회합니다.             | `OnFetchAppLogBufferSize` |
| `Ping`                  | `{ payload: 'hello' }`                                                           | 연결 및 상태 확인을 위해 핑을 보냅니다.       | `Pong`                    |

---

# App to Web (Response & Event)

앱에서 요청에 대한 **결과**를 전달하거나, 시스템 상태 변화에 따른 이벤트를 웹으로 **푸시(Push)**하는 메시지 규약입니다.

### Device & System

| Message Type                | Description                                                 | Data Structure (Example)                                                                                                                     |
| :-------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `OnUpdateDeviceInfo`        | 기기 정보 및 버전 정보 전달 (웹 로딩/버전체크 시 자동 Push) | `{ platform: 'ios', stage: 'PROD', application: 'Chatic', currentVersion: '1.0.0', latestVersion: '1.0.0', shouldUpdate: true }`             |
| `OnFetchSafeArea`           | Safe Area(노치 등) 정보 반환                                | `{ safeArea: { top: 47, bottom: 34, left: 0, right: 0 } }`                                                                                   |
| `OnBackgroundStatusChanged` | 앱이 백그라운드/포그라운드로 진입할 때 전달                 | `{ status: 'background', isBackground: true, isForeground: false }`                                                                          |
| `OnSetCanGoBack`            | 뒤로가기 설정 상태 결과 반환                                | -                                                                                                                                            |
| `OnOpenModal`               | 모달/바텀시트가 열렸을 때 전달                              | -                                                                                                                                            |
| `OnCloseModal`              | 모달/바텀시트가 닫혔을 때 전달                              | -                                                                                                                                            |
| `OnOpenSettings`            | 기기 설정 화면 열기 결과 반환                               | -                                                                                                                                            |
| `OnOpenShareSheet`          | 공유 시트 액션이 완료/취소되었을 때 전달                    | `{ action: 'sharedAction' }`                                                                                                                 |
| `OnBackPressed`             | 네이티브 물리적 뒤로가기 제스처 발생 시 전달 (Push Event)   | -                                                                                                                                            |
| `OnOpenDocument`            | 파일 선택기에서 선택된 문서 목록 전달                       | `{ documents: [{ uri: '...', name: 'file.pdf', type: 'application/pdf', size: 12345 }] }`                                                    |
| `OnGetContacts`             | 권한 획득 후 주소록 연락처 목록 전달                        | `{ contacts: [{ recordID: '1', displayName: '홍길동', phoneNumbers: [{ label: 'mobile', number: '010-1234-5678' }], emailAddresses: [] }] }` |
| `OnOpenCamera`              | 카메라로 촬영된 미디어 에셋 전달                            | `{ assets: [{ uri: '...', width: 1000, height: 1000, type: 'image/jpeg', fileSize: 204850 }] }`                                              |
| `OnOpenPhotoLibrary`        | 갤러리에서 선택된 미디어 에셋 전달                          | `{ assets: [{ uri: '...', width: 1000, height: 1000, type: 'image/jpeg', fileSize: 204850 }] }`                                              |
| `OnRequestPermission`       | 시스템 권한 요청 허용/거부 결과 전달                        | `{ permission: 'CAMERA', status: 'GRANTED' }`                                                                                                |
| `OnOpenURL`                 | 외부 URL 실행 결과 반환                                     | -                                                                                                                                            |
| `OnSendSms`                 | SMS 전송(앱 실행) 성공 여부 반환                            | `{ success: true }`                                                                                                                          |
| `OnFetchAppIcon`            | 현재 적용된 앱 아이콘 key 반환                              | `{ iconName: 'WhiteIcon', supported: true }`                                                                                                 |
| `OnFetchAppIconList`        | 변경 가능한 앱 아이콘 목록 반환                             | `{ availableIcons: [{ id: null, label: '기본 아이콘 (Default)' }, { id: 'WhiteIcon', label: '화이트 에디션 (White)' }] }`                    |
| `OnChangeAppIcon`           | 앱 아이콘 변경 성공 여부 반환                               | `{ success: true, requestedIconName: 'WhiteIcon', iconName: 'WhiteIcon', supported: true }`                                                  |
| `Pong`                      | Ping에 대한 응답 반환                                       | `{ payload: 'hello' }`                                                                                                                       |

### Notification

| Message Type            | Description                                             | Data Structure (Example)                                    |
| :---------------------- | :------------------------------------------------------ | :---------------------------------------------------------- |
| `OnFetchFcmToken`       | FCM 토큰이 성공적으로 발급/갱신되었을 때                | `{ token: 'ey...' }`                                        |
| `OnReceiveNotification` | 앱이 **Foreground** 상태일 때 푸시 수신 시 (Push Event) | `{ notification: { title: '...', body: '...', data: {} } }` |
| `OnFetchBadgeCount`     | 앱의 현재 네이티브 뱃지 카운트 조회의 결과 값을 반환    | `{ count: 5 }`                                              |
| `OnSetBadgeCount`       | 앱의 네이티브 뱃지 카운트 설정 성공 여부를 반환         | `{ success: true }`                                         |

### In-App Purchase (IAP)

| Message Type                   | Description                                | Data Structure (Example)                                                                                         |
| :----------------------------- | :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `OnFetchProducts`              | 스토어의 결제 가능 상품 목록 반환          | `{ products: [{ id: 'pro_monthly', displayName: '프리미엄 1개월', displayPrice: '₩10,000', currency: 'KRW' }] }` |
| `OnFetchCurrentPurchases`      | 사용자의 현재 활성화된 구독/구매 현황 반환 | `{ purchases: [{ productId: 'pro_monthly', transactionId: '...', transactionReceipt: '...' }] }`                 |
| `OnPurchase`                   | 인앱결제 요청 처리 접수 반환               | -                                                                                                                |
| `OnPurchaseSuccess`            | 결제 트랜잭션 성공 및 영수증 원본 반환     | `{ purchase: { transactionId: '...', productId: 'pro_monthly', ... } }`                                          |
| `OnPurchaseError`              | 결제 실패 또는 사용자 취소 에러 반환       | `{ error: { code: 'E_USER_CANCELLED', message: '...' } }`                                                        |
| `OnFinishPurchaseTransaction`  | 영수증 완료(Finish) 처리 결과 반환         | `{ purchase: { transactionId: '...', ... } }`                                                                    |
| `OnOpenSubscriptionManagement` | 구독 관리 페이지 실행 여부 반환            | -                                                                                                                |

### Cache

| Message Type              | Description                            | Data Structure (Example)                                       |
| :------------------------ | :------------------------------------- | :------------------------------------------------------------- |
| `OnFetchCacheData`        | 단건 캐시 조회 결과 반환 (없으면 null) | `{ type: 'user', id: '123', item: {...} }`                     |
| `OnFetchAllCacheData`     | 캐시 목록 전달                         | `{ type: "chat", items: [...], query: { channelId: 'ch_1' } }` |
| `OnSaveCacheData`         | 단건 캐시 데이터 저장 완료             | `{ type: 'user', id: '123', success: true }`                   |
| `OnSaveAllCacheData`      | 일괄 저장 결과 전달                    | `{ type: "user", ids: ["u1", "u2"], success: true }`           |
| `OnDeleteCacheData`       | 단건 캐시 데이터 삭제 완료             | `{ type: 'user', id: '123', success: true }`                   |
| `OnDeleteAllCacheData`    | 다수 캐시 데이터 삭제 완료             | `{ type: 'chat', ids: ['1', '2'], success: true }`             |
| `OnClearCacheData`        | 캐시 초기화 완료 여부 반환             | `{ type: 'chat', success: true }`                              |
| `OnSearchGlobalCacheData` | 다중 도메인 통합 검색 결과 반환        | `{ items: [{ ... }] }`                                         |

### Preference & Auth

| Message Type         | Description                               | Data Structure (Example)                             |
| :------------------- | :---------------------------------------- | :--------------------------------------------------- |
| `OnFetchPreference`  | 로컬 설정 값 조회 결과 반환               | `{ key: 'theme', value: 'dark' }`                    |
| `OnSavePreference`   | 로컬 설정 값 저장 성공 여부               | `{ key: 'theme', success: true }`                    |
| `OnDeletePreference` | 로컬 설정 값 삭제 성공 여부               | `{ key: 'theme', success: true }`                    |
| `OnOAuthLogin`       | 소셜 로그인 성공 결과 (실패/취소 시 null) | `{ result: { provider: 'google', idToken: '...' } }` |
| `OnOAuthLogout`      | 소셜 로그아웃 처리 완료 여부              | `{ success: true }`                                  |

### Log & Common & Others

| Message Type              | Description                         | Data Structure (Example)                               |
| :------------------------ | :---------------------------------- | :----------------------------------------------------- |
| `OnSendLog`               | 로그 수신 및 처리 결과 반환         | -                                                      |
| `OnFetchAppLogBuffer`     | 로그 버퍼 조회 결과 반환            | `{ logs: [{ tag: 'APP', message: '...' }], size: 42 }` |
| `OnPollAppLogBuffer`      | 로그 버퍼 poll(조회+제거) 결과 반환 | `{ logs: [{ tag: 'APP', message: '...' }], size: 21 }` |
| `OnClearAppLogBuffer`     | 로그 버퍼 clear 결과 반환           | `{ success: true, size: 0 }`                           |
| `OnFetchAppLogBufferSize` | 현재 로그 버퍼 크기 반환            | `{ size: 21 }`                                         |
