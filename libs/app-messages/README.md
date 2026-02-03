# app-messages

This library was generated with [Nx](https://nx.dev).

# Web-Driven Interface

- Web: 앱의 상태를 관리하고, 필요할 때 네이티브 기능을 **요청**합니다.
- Native: 웹의 요청을 수행하고 결과를 **응답**하거나, 시스템 상태 변화를 **동기화**하여 웹에 전달합니다.

## Flow

- Request (Web → App): 웹이 네이티브 기능(토큰 요청, UI 제어 등)을 실행하기 위해 메시지를 보냅니다.
- Response (App → Web): 앱이 요청된 작업을 수행하고 결과를 돌려줍니다.
- Event (App → Web): 시스템 이벤트(알림 수신, 클릭 등)가 발생하면 앱이 웹에게 능동적으로 알립니다.

# Web to App

웹에서 네이티브 기능을 실행하기 위해 보내는 메시지입니다.

```typescript
type WebMessageType =
    | 'GetFcmToken' // FCM 토큰 요청 (Response: SetFcmToken)
    | 'GetSafeArea'; // Safe Area 정보 요청 (Response: SetSafeArea)
```

# App to Web

앱에서 요청에 대한 결과 또는 상태 변화에 따른 동기화 정보를 보내는 메시지입니다.

```typescript
type AppMessageType =
    | 'SetFcmToken' // FCM 토큰 전달
    | 'SetSafeArea' // Safe Area 정보 전달
    | 'NotificationReceived' // 앱이 실행 중(Foreground)일 때 푸시 알림을 수신하면 발생
    | 'NotificationOpened'; // 유저가 알림을 클릭하여 앱에 진입했을 때 발생
```
