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

| Message Type               | Payload (Data)                                                                        | Description                                              | Expected Response                                            |
| :------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------- | :----------------------------------------------------------- | --- |
| `CloseModal`               | -                                                                                     | 모달 닫기                                                | -                                                            |
| `OpenModal`                | `{ url: string; type?: 'full';'sheet'; heightRatio?: number; dragHandle?: boolean; }` | 모달 열기                                                | -                                                            |
| `GetFcmToken`              | -                                                                                     | FCM 푸시 토큰을 요청합니다.                              | `OnUpdateFcmToken`                                           |     |
| `GetSafeArea`              | -                                                                                     | 기기의 Safe Area(Notch 등) 정보를 요청합니다.            | `OnUpdateSafeArea`                                           |
| `GetProducts`              | -                                                                                     | 스토어에 등록된 구독 상품 목록을 요청합니다.             | `OnUpdateProductSubscriptions`                               |
| `GetCurrentPurchases`      | -                                                                                     | 현재 사용자가 보유 중인 구독 내역을 요청합니다.          | `OnUpdatePurchases`                                          |
| `CheckUnfinishedPurchases` | -                                                                                     | 미완료된 결제 건을 복구하거나, 구매 내역을 최신화합니다. | `OnSuccessPurchase`                                          |
| `PurchaseSubscription`     | `{ sku: string }`                                                                     | 특정 상품(`sku`)의 구독 결제 프로세스를 시작합니다.      | 성공 시: `OnSuccessPurchase`<br/>실패 시: `OnAppLog` (Error) |

---

# App to Web

앱에서 요청에 대한 결과 또는 상태 변화에 따른 동기화 정보를 보내는 메시지입니다.
앱 상태변화에 따른 데이터를 웹으로 푸시하거나 웹에서 요청한 데이터를 전달합니다.

### Control

| Message Type   | Description             | Data Structure (Example) |
| :------------- | :---------------------- | :----------------------- |
| `OnCloseModal` | 모달이 닫혔음을 떄 전달 | -                        |

### System

| Message Type       | Description                                   | Data Structure (Example)                          |
| :----------------- | :-------------------------------------------- | :------------------------------------------------ |
| `OnUpdateSafeArea` | Safe Area 정보가 갱신되었을 때 전달           | `{ top: 47, bottom: 34, left: 0, right: 0 }`      |
| `OnAppLog`         | 네이티브에서 발생한 에러나 로그를 웹으로 전달 | `{ level: "error", message: "Network Error..." }` |

### Notification

| Message Type            | Description                                      | Data Structure (Example)                               |
| :---------------------- | :----------------------------------------------- | :----------------------------------------------------- |
| `OnUpdateFcmToken`      | FCM 토큰이 발급되거나 갱신되었을 때 전달         | `{ token: "ey..." }`                                   |
| `OnReceiveNotification` | 앱이 **실행 중(Foreground)**일 때 푸시 알림 수신 | `{ title: "이벤트", body: "할인 시작!", data: {...} }` |
| `OnOpenNotification`    | 유저가 **알림을 클릭**하여 앱에 진입했을 때 발생 | `{ type: "chat", id: "123", ... }`                     |

### In-App Purchase

| Message Type                   | Description                                               | Data Structure (Example)                                      |
| :----------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------ |
| `OnUpdateProductSubscriptions` | 스토어의 구독 상품 목록 정보 전달                         | `{ products: [{ productId: "pro_monthly", price: "..." }] }`  |
| `OnUpdatePurchases`            | 사용자의 현재 구독(구매) 보유 현황 전달                   | `{ purchases: [{ productId: "...", transactionDate: ... }] }` |
| `OnSuccessPurchase`            | 결제 프로세스(서버 검증 포함)가 **최종 성공**했을 때 발생 | -                                                             |
