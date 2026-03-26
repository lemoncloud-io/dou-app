# app-messages

This library was generated with [Nx](https://nx.dev).

# Web-Driven Interface

- Web: 앱의 상태를 관리하고, 필요할 때 네이티브 기능을 **요청**합니다.
- Native: 웹의 요청을 수행하고 결과를 **응답**하거나, 시스템 상태 변화를 **동기화**하여 웹에 전달합니다.

## Flow

- Request (Web → App): 웹이 네이티브 기능(토큰 요청, UI 제어 등)을 실행하기 위해 메시지를 보냅니다.
- Response (App → Web): 앱이 요청된 작업을 수행하고 결과를 돌려줍니다. (주의: async)
- Event Push (App → Web): 시스템 이벤트(알림 수신, 클릭 등)가 발생하면 앱이 웹에게 능동적으로 알립니다.

# Web to App

웹에서 네이티브 기능을 실행하기 위해 보내는 메시지입니다.

| Message Type                 | Payload (Data)                                                                        | Description                                                                                            | Expected Response             |
| :--------------------------- | :------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------- | :---------------------------- |
| `CloseModal`                 | -                                                                                     | 모달 닫기                                                                                              | -                             |
| `OpenModal`                  | `{ url: string; type?: 'full';'sheet'; heightRatio?: number; dragHandle?: boolean; }` | 모달 열기                                                                                              | -                             |
| `OpenSettings`               | -                                                                                     | 앱 설정 화면으로 이동합니다.                                                                           | -                             |
| `OpenShareSheet`             | `{ title?: string; message?: string; url?: string; ... }`                             | 시스템 공유 시트를 엽니다.; 주의사항: iOS는 url,message 필드 둘 중 하나만 사용하여야만 합니다.         | `OnOpenShareSheet`            |
| `OpenDocument`               | `{ allowMultiSelection?: boolean; type?: string[] }`                                  | 파일 선택기를 엽니다.                                                                                  | `OnPickDocument`              |
| `OpenCamera`                 | `{ mediaType?: 'photo'\|'video'; ... }`                                               | 카메라를 실행하여 사진/동영상을 촬영합니다.                                                            | `OnOpenCamera`                |
| `OpenPhotoLibrary`           | `{ selectionLimit?: number; mediaType?: ... }`                                        | 갤러리(사진첩)를 엽니다.                                                                               | `OnOpenPhotoLibrary`          |
| `FetchFcmToken`              | -                                                                                     | FCM 푸시 토큰을 요청합니다.                                                                            | `OnFetchFcmToken`             |
| `FetchSafeArea`              | -                                                                                     | 기기의 Safe Area(Notch 등) 정보를 요청합니다.                                                          | `OnFetchSafeArea`             |
| `FetchProducts`              | -                                                                                     | 스토어에 등록된 구독 상품 목록을 요청합니다.                                                           | `OnFetchProducts`             |
| `FetchCurrentPurchases`      | -                                                                                     | 현재 사용자가 보유 중인 구독 내역을 요청합니다.                                                        | `OnFetchCurrentPurchases`     |
| `Purchase`                   | `{ sku: string; oldSku?: string }`                                                    | 특정 상품(`sku`)의 구독 결제 프로세스를 시작합니다. (Android 업그레이드시 `oldSku` 포함)               | `OnPurchase`                  |
| `FinishPurchaseTransaction`  | `{ purchase: Purchase }`                                                              | 웹 서버 검증을 마친 영수증의 트랜잭션을 스토어에서 완료 처리합니다. (완료 처리를 하지않을 경우 환불됨) | `OnFinishPurchaseTransaction` |
| `OpenSubscriptionManagement` | -                                                                                     | 기기 OS에 맞는 스토어 구독 관리 페이지로 이동합니다.                                                   | -                             |
| `FetchAllCacheData`          | `{ type: 'channel'\|'chat'\|'user'\|'join'; query?: {...} }`                          | 로컬 캐시(MMKV/SQLite)의 특정 도메인 전체 목록을 요청합니다.                                           | `OnFetchAllCacheData`         |
| `FetchCacheData`             | `{ type: ...; id: string }`                                                           | 로컬 캐시의 특정 데이터를 요청합니다.                                                                  | `OnFetchCacheData`            |
| `SaveCacheData`              | `{ type: ...; id: string; value: object }`                                            | 데이터를 로컬 캐시에 저장(Upsert)합니다.                                                               | `OnSaveCacheData`             |
| `SaveAllCacheData`           | `{ type: ...; items: object[] }`                                                      | 다수의 데이터를 로컬 캐시에 일괄 저장(Upsert)합니다.                                                   | `OnSaveAllCacheData`          |
| `DeleteCacheData`            | `{ type: ...; id: string }`                                                           | 로컬 캐시의 특정 데이터를 삭제합니다.                                                                  | `OnDeleteCacheData`           |
| `DeleteAllCacheData`         | `{ type: ...; ids?: string[] }`                                                       | 로컬 캐시의 데이터들을 일괄 삭제합니다.                                                                | `OnDeleteAllCacheData`        |
| `FetchPreference`            | `{ key: string }`                                                                     | 앱 설정(Preference) 값을 요청합니다.                                                                   | `OnFetchPreference`           |
| `SavePreference`             | `{ key: string; value: any }`                                                         | 앱 설정(Preference) 값을 저장합니다.                                                                   | `OnSavePreference`            |
| `DeletePreference`           | `{ key: string }`                                                                     | 앱 설정(Preference) 값을 삭제합니다.                                                                   | `OnDeletePreference`          |
| `OAuthLogin`                 | `{ provider: 'google'\|'apple' }`                                                     | 소셜 로그인(OAuth)을 요청합니다.                                                                       | `OnOAuthLogin`                |
| `OAuthLogout`                | `{ provider: 'google'\|'apple' }`                                                     | 소셜 로그아웃을 요청합니다.                                                                            | `OnOAuthLogout`               |

---

# App to Web

앱에서 요청에 대한 결과 또는 상태 변화에 따른 동기화 정보를 보내는 메시지입니다.
앱 상태변화에 따른 데이터를 웹으로 푸시하거나 웹에서 요청한 데이터를 전달합니다.

### Control

| Message Type         | Description              | Data Structure (Example)                                |
| :------------------- | :----------------------- | :------------------------------------------------------ |
| `OnCloseModal`       | 모달이 닫혔음을 떄 전달  | -                                                       |
| `OnOpenShareSheet`   | 공유 시트 닫혔을 때 전달 | -                                                       |
| `OnOpenDocument`     | 선택된 파일 목록 전달    | `{ documents: [{ uri: "...", name: "file.pdf" }] }`     |
| `OnOpenCamera`       | 촬영된 미디어 에셋 전달  | `{ assets: [{ uri: "...", width: 100, height: 100 }] }` |
| `OnOpenPhotoLibrary` | 선택된 미디어 에셋 전달  | `{ assets: [{ uri: "...", width: 100, height: 100 }] }` |

### System

| Message Type      | Description                                   | Data Structure (Example)                          |
| :---------------- | :-------------------------------------------- | :------------------------------------------------ |
| `OnFetchSafeArea` | Safe Area 정보가 갱신되었을 때 전달           | `{ top: 47, bottom: 34, left: 0, right: 0 }`      |
| `OnAppLog`        | 네이티브에서 발생한 에러나 로그를 웹으로 전달 | `{ level: "error", message: "Network Error..." }` |

### Notification

| Message Type            | Description                                      | Data Structure (Example)                               |
| :---------------------- | :----------------------------------------------- | :----------------------------------------------------- |
| `OnFetchFcmToken`       | FCM 토큰이 발급되거나 갱신되었을 때 전달         | `{ token: "ey..." }`                                   |
| `OnReceiveNotification` | 앱이 **실행 중(Foreground)**일 때 푸시 알림 수신 | `{ title: "이벤트", body: "할인 시작!", data: {...} }` |
| `OnOpenNotification`    | 유저가 **알림을 클릭**하여 앱에 진입했을 때 발생 | `{ type: "chat", id: "123", ... }`                     |

### In-App Purchase

| Message Type                  | Description                                     | Data Structure (Example)                                      |
| :---------------------------- | :---------------------------------------------- | :------------------------------------------------------------ |
| `OnFetchProducts`             | 스토어의 구독 상품 목록 정보 전달               | `{ products: [{ productId: "pro_monthly", price: "..." }] }`  |
| `OnFetchCurrentPurchases`     | 사용자의 현재 구독(구매) 보유 현황 전달         | `{ purchases: [{ productId: "...", transactionDate: ... }] }` |
| `OnPurchase`                  | 결제 진행 결과(성공 영수증 원본 또는 에러) 전달 | `{ purchase: { transactionId: "...", ... } }`                 |
| `OnFinishPurchaseTransaction` | 영수증 스토어 완료(Finish) 처리 완료 전달       | `{ purchase: { transactionId: "...", ... } }`                 |

### Cache

| Message Type           | Description                                | Data Structure (Example)                              |
| :--------------------- | :----------------------------------------- | :---------------------------------------------------- |
| `OnFetchAllCacheData`  | 요청된 도메인의 전체 캐시 데이터 목록 전달 | `{ type: "channel", items: [{ id: "ch_1", ... }] }`   |
| `OnFetchCacheData`     | 요청된 단건 캐시 데이터 전달               | `{ type: "user", id: "user_1", item: { name: ... } }` |
| `OnSaveCacheData`      | 캐시 저장 작업의 성공 여부 전달            | `{ type: "chat", id: "msg_1" }`                       |
| `OnSaveAllCacheData`   | 다수 캐시 데이터 저장 완료 전달            | `{ type: "chat", ids: ["msg_1", "msg_2"] }`           |
| `OnDeleteCacheData`    | 단건 캐시 데이터 삭제 완료 전달            | `{ type: "user", id: "user_1" }`                      |
| `OnDeleteAllCacheData` | 다수 캐시 데이터 삭제 완료 전달            | `{ type: "channel", ids: ["ch_1", "ch_2"] }`          |

### Search

| Message Type            | Description                                    | Data Structure (Example)                              |
| :---------------------- | :--------------------------------------------- | :---------------------------------------------------- |
| `OnExecuteGlobalSearch` | 다중 도메인(채팅, 채널 등) 통합 검색 결과 반환 | `{ items: [{ _domain: 'chat', id: '1', ... }, ...] }` |

### Preference

| Message Type         | Description                 | Data Structure (Example)               |
| :------------------- | :-------------------------- | :------------------------------------- |
| `OnFetchPreference`  | 요청된 설정 값 전달         | `{ key: "theme", value: "dark" }`      |
| `OnSavePreference`   | 설정 값 저장 성공 여부 전달 | `{ key: "theme", success: true }`      |
| `OnDeletePreference` | 설정 값 삭제 성공 여부 전달 | `{ key: "isFirstRun", success: true }` |

### OAuth

| Message Type    | Description                  | Data Structure (Example)                                                      |
| :-------------- | :--------------------------- | :---------------------------------------------------------------------------- |
| `OnOAuthLogin`  | 소셜 로그인 결과 전달        | `{ result: { provider: "google", idToken: "...", user: {...} } }` 또는 `null` |
| `OnOAuthLogout` | 소셜 로그아웃 성공 여부 전달 | `{ success: true }`                                                           |
