# Chatic Unified Push Payload Specification

본 문서는 Chatic 하이브리드 앱의 최적화된 모바일 푸시 아키텍처에 맞춘 **공통 푸시 페이로드 규격 및 Android 알림 채널 설계**를 정의합니다.

---

## 1. 아키텍처 개요 및 설계 원칙

1. **단순함 및 신뢰성 우선**:
    - 백그라운드 상태에서 푸시가 도달할 때는 데이터를 백그라운드 저장소에 임시 저장하거나 웹뷰와 동기화하지 않고, **오직 유저용 알림 배너만 노출**시킵니다.
    - 사용자가 앱을 실행하는 즉시 **소켓 연결 및 웹뷰의 Sync API**를 통해 밀린 대화 데이터를 실시간으로 동기화합니다.
2. **Android (Data-Only FCM)**:
    - 백그라운드 및 종료 상태에서 네이티브 자바 서비스(`FirebaseMessagingService`)가 직접 수신하여 다국어 문자열 조립 후 수동으로 알림 배너를 띄웁니다.
3. **iOS (Mutable-Content APNs)**:
    - iOS 시스템이 기본 배너를 띄우기 직전에 Swift Extension(`Notification Service Extension`)이 개입하여 다국어 조립을 수행하고 배너를 노출합니다.
4. **포그라운드 수신**:
    - 앱이 활성화된 상태(Foreground)에서는 시스템 배너를 띄우지 않고, 네이티브 단에서 웹뷰로 데이터를 즉시 전송하여 **인앱 알림(Toast) 및 실시간 대화 갱신**으로 처리합니다.
5. **뱃지(Badge) 처리**:
    - 푸시 알림 수신 시에는 원칙적으로 뱃지 카운트 정보를 전달받지 않으며, 별도 프론트엔드(웹/앱) 비즈니스 로직에서 활성 채팅방 정보 및 읽지 않은 메시지 카운트와 조합하여 앱 뱃지를 최종 반영합니다.

---

## 2. 공통 Push 스펙 정의 (Common Fields)

FCM(Android)과 APNs(iOS)에서 사용하는 공통 데이터 규격입니다.

| 필드명 (Key)             | 타입                | 필수 여부 | 설명                                                                                                                                                                                                                                              | 예시 값                                                                                                            |
| :----------------------- | :------------------ | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------- |
| **`id`**                 | String              | 필수      | 푸시 메시지 고유 식별자. 단말 단 중복 방지 및 포그라운드 중복 수신 제거용.                                                                                                                                                                        | `"msg_20260610_003"`                                                                                               |
| **`type`**               | String              | 필수      | 푸시 메시지가 어떤 유형인지 판단하기 위해 요구됨 (ex: `chat`, `system`, `billing`, ...). 번역 파일(`ko.json`, `en.json`)의 `loc_key` 타입(접두사)과 일치함.                                                                                       | `"chat"`                                                                                                           |
| **`channel_id`**         | String              | 필수      | Android 알림 채널 매핑 ID 및 iOS 채널 전략 매핑용.                                                                                                                                                                                                | `"dou_chat"`                                                                                                       |
| **`link`** (생략가능)    | String              | 옵션      | 딥링크/URL 정보. 없을 경우 메인 화면으로 이동함.<br>• relative path로 전달될 경우 앱 내에서 환경별(dev/prod) 스키마를 붙여 라우팅함.<br>• **dev**: `chatic-dev://app-dev.chatic.io/<주소정보>`<br>• **prod**: `chatic://app.chatic.io/<주소정보>` | `"channel?channelId=room_123"`                                                                                     |
| **`timestamp`**          | String              | 필수      | 서버 발송 일시 (Epoch Milliseconds).                                                                                                                                                                                                              | `"1718012345000"`                                                                                                  |
| **`title_loc_key`**      | String              | 필수      | 다국어 지원용 제목 번역 키. (채팅 유형의 경우 보내는 사람의 이름)                                                                                                                                                                                 | `"notification.chat.title"`                                                                                        |
| **`title_loc_args`**     | String (JSON Array) | 필수      | 제목 번역 템플릿에 주입할 변수 리스트.                                                                                                                                                                                                            | `"[\"홍길동\"]"`                                                                                                   |
| **`loc_key`**            | String              | 필수      | 다국어 지원용 본문 번역 키. (채팅 유형의 경우 메시지 본문 내용)                                                                                                                                                                                   | `"notification.chat.message"`                                                                                      |
| **`loc_args`**           | String (JSON Array) | 필수      | 본문 번역 템플릿에 주입할 변수 리스트.                                                                                                                                                                                                            | `"[\"오늘 회의 참석하시나요?\"]"`                                                                                  |
| **`silent`** (생략가능)  | Boolean             | 옵션      | 무음 푸시(Silent Push) 여부. 기본값은 `false` 이며, `true`일 경우 백그라운드/종료 상태에서 시스템 노티 배너를 띄우지 않습니다.                                                                                                                    | `false`                                                                                                            |
| **`payload`** (생략가능) | String (JSON Map)   | 필수      | 푸시 수신 시 혹은 클릭 진입 시 웹뷰(React) 비즈니스 로직에 전달해 줄 메타데이터 보관 객체. (상세 내역 아래 참고)                                                                                                                                  | `{"cid":"cloud_1","uid":"user_456","channelId":"room_123","chatId":"msg_789","content":"오늘 회의 참석하시나요?"}` |

> [!NOTE]
> FCM의 최상위 데이터 전송 객체인 `data`와 필드명이 겹치는 혼선을 피하기 위해 메타데이터 객체의 Key를 **`payload`**로 정의합니다.

### 2.1. `payload` 메타데이터 객체 세부 규격 (채팅 수신 시나리오 기준)

> [!IMPORTANT]
> 본 규격은 **채팅 수신 시나리오**를 기준으로 작성되었습니다. 향후 클라우드 생성, 구독 상태 갱신 등의 비동기 이벤트가 추가될 경우 별도의 `type` 분류와 함께 `payload` 내부 메타데이터 필드가 확장 정의될 예정입니다.

| 필드명 (Key)    | 타입   | 설명                                                                                                                                | 비고                   |
| :-------------- | :----- | :---------------------------------------------------------------------------------------------------------------------------------- | :--------------------- |
| **`cid`**       | String | 어느 클라우드에서 보낸 메시지인지 확인하기 위한 목적 (Cloud ID)                                                                     | 클라우드 식별용        |
| **`uid`**       | String | 수신받는 유저 아이디 (ex: A가 B에게 보낼 경우 B의 아이디). 네이티브 단에서 uid를 활용해 다중 계정 분기나 캐싱을 지원하기 위한 목적. | 수신 대상 식별         |
| **`channelId`** | String | 서비스 내 채팅방/채널 ID                                                                                                            | 라우팅/동기화 타겟     |
| **`chatId`**    | String | 채팅 메시지 고유 ID                                                                                                                 | 메시지 중복 체크용     |
| **`content`**   | String | 암호화되지 않은 원본 메시지 내용 (혹은 미리보기용 텍스트)                                                                           | foreground 즉시 갱신용 |

---

## 3. Android 알림 채널 규격 (Android Channel Specification)

- **우선순위(Priority)**: High(즉시 전송, 절전 모드 해제 가능) 및 Normal(지연 도착 가능).
- **채널 ID (`channel_id`) 지정 필수**: 푸시 유형별 소리/진동 및 팝업 배너 표시 여부를 제어하기 위해 반드시 지정해야 합니다. (FCM `notification` 객체가 아닌 `data` 내부 필드로 전달 필수)

| 용도 / 카테고리         | 채널 ID (`channel_id`) | Priority   | 채널 이름 (OS 설정 노출용) | 기기 동작 방식 (수신 시)                                  | 비고                                                                         |
| :---------------------- | :--------------------- | :--------- | :------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **일반 채팅 (기본)**    | `dou_chat`             | **high**   | 새 메시지                  | 상단 배너 팝업 노출 (O), 소리/진동 (O)                    | 일반 대화 알림용                                                             |
| **무음 채팅 (알림 끔)** | `dou_chat_muted`       | **high**   | 새 메시지                  | 팝업 없음 (X), 소리/진동 (X), 상단바 트레이에 조용히 적재 | 채팅방 알림 끄기와는 다른 동작으로, 알림 트레이에는 쌓되 조용히 보낼 때 사용 |
| **공지사항**            | `dou_notice`           | **normal** | 서비스 공지사항            | 팝업 없음 (X), 소리/진동 (O)                              | 중요 서비스 공지용                                                           |
| **마케팅/이벤트**       | `dou_marketing`        | **normal** | 이벤트 및 혜택             | 팝업 없음 (X), 소리/진동 (X), 상단바 트레이에 조용히 적재 | 마케팅 혜택 알림용                                                           |
| **클라우드 기능**       | `dou_cloud`            | **high**   | 클라우드                   | 상단 배너 팝업 노출 (O), 소리/진동 (O)                    | 클라우드 생성, 삭제 완료 등 기능 알림용                                      |

---

## 4. iOS 알림 및 헤더 규격 (iOS Notification & Header Specification)

iOS는 안드로이드와 같이 별도의 시스템 채널 설정이 존재하지 않지만, 페이로드 수신 시 **`Notification Service Extension`**에서 `channel_id`를 기반으로 소리 여부를 제어하며, 서버 발송 시 APNs 전송 헤더를 정확히 일치시켜야 합니다.

- **APNs 발송 우선순위 및 타입 설정**:
    - **일반 알림 (`silent: false` 인 모든 푸시)**:
        - HTTP/2 헤더 `apns-push-type` ➡️ `"alert"`
        - HTTP/2 헤더 `apns-priority` ➡️ `"10"` (즉시 전송)
    - **무음 푸시 (`silent: true` 인 백그라운드 푸시)**:
        - HTTP/2 헤더 `apns-push-type` ➡️ `"background"`
        - HTTP/2 헤더 `apns-priority` ➡️ `"5"` (지연 전송 가능, 배터리 절전 모드 대응)
        - 페이로드 `aps` 내 `"content-available": 1` 및 `alert` 미포함

- **채널 ID (`channel_id`)에 따른 소리(Sound) 동작 전략**:

| 채널 ID (`channel_id`) | APNs Header Priority | 기기 동작 방식 (수신 시)               | 비고                                                       |
| :--------------------- | :------------------- | :------------------------------------- | :--------------------------------------------------------- |
| `dou_chat`             | **10** (Alert)       | 상단 배너 팝업 노출 (O), 소리/진동 (O) | 일반 채팅 알림                                             |
| `dou_chat_muted`       | **10** (Alert)       | 상단 배너 팝업 노출 (O), 소리/진동 (X) | 알림이 꺼진 채팅방 푸시 (Extension에서 `sound = nil` 처리) |
| `dou_notice`           | **10** (Alert)       | 상단 배너 팝업 노출 (O), 소리/진동 (O) | 공지사항 알림                                              |
| `dou_marketing`        | **10** (Alert)       | 상단 배너 팝업 노출 (O), 소리/진동 (X) | 이벤트 마케팅 알림 (Extension에서 `sound = nil` 처리)      |
| `dou_cloud`            | **10** (Alert)       | 상단 배너 팝업 노출 (O), 소리/진동 (O) | 클라우드 기능 관련 알림                                    |

---

## 5. 플랫폼별 발송 페이로드 규격 예시 (채팅 수신 시나리오)

### 4.1. Android FCM HTTP v1 API 발송 예시

- **주의**: `notification` 객체를 절대 포함해서는 안 됩니다. (FCM data-only 포맷 필수)

```json
{
    "message": {
        "token": "ANDROID_DEVICE_FCM_TOKEN",
        "android": {
            "priority": "HIGH",
            "ttl": "0s"
        },
        "data": {
            "id": "msg_20260610_003",
            "type": "chat",
            "channel_id": "dou_chat",
            "link": "channel?channelId=room_123",
            "timestamp": "1718012345000",
            "title_loc_key": "notification.chat.title",
            "title_loc_args": "[\"홍길동\"]",
            "loc_key": "notification.chat.message",
            "loc_args": "[\"오늘 회의 참석하시나요?\"]",
            "silent": "false",
            "payload": "{\"cid\":\"cloud_1\",\"uid\":\"user_456\",\"channelId\":\"room_123\",\"chatId\":\"msg_789\",\"content\":\"오늘 회의 참석하시나요?\"}"
        }
    }
}
```

### 4.2. iOS APNs Provider API 발송 예시

- **주의**:
    - `mutable-content`를 `aps` 하위에 필수로 지정하여 Swift Extension이 개입할 수 있도록 합니다.
    - iOS의 경우 발송 우선순위(`apns-priority`) 및 푸시 타입(`apns-push-type`)은 JSON 본문(Body) 내부가 아닌, **HTTP/2 요청 헤더(Headers)**에 포함하여 전송해야 하므로 아래 JSON 페이로드 바디에는 해당 키가 포함되지 않습니다. (상세 헤더 설정은 위의 '4. iOS 알림 및 헤더 규격' 섹션 참고)

```json
{
    "aps": {
        "alert": {
            "title": "Default Title",
            "body": "Default Body"
        },
        "mutable-content": 1,
        "sound": "default"
    },
    "id": "msg_20260610_003",
    "type": "chat",
    "channel_id": "dou_chat",
    "link": "channel?channelId=room_123",
    "timestamp": "1718012345000",
    "title_loc_key": "notification.chat.title",
    "title_loc_args": "[\"홍길동\"]",
    "loc_key": "notification.chat.message",
    "loc_args": "[\"오늘 회의 참석하시나요?\"]",
    "silent": false,
    "payload": {
        "cid": "cloud_1",
        "uid": "user_456",
        "channelId": "room_123",
        "chatId": "msg_789",
        "content": "오늘 회의 참석하시나요?"
    }
}
```

---

## 6. 다국어 로컬라이제이션 매핑 구조

클라이언트는 다국어 리소스(`ko.json`, `en.json`)의 아래 키 구조를 참조하여 네이티브 단에서 푸시 내용을 치환합니다.

### 5.1. 다국어 리소스 예시 (`ko.json`)

```json
{
    "notification": {
        "channel": {
            "chat": "새 메시지",
            "notice": "서비스 공지사항",
            "marketing": "이벤트 및 혜택",
            "cloud": "클라우드"
        },
        "chat": {
            "title": "{0}",
            "message": "{0}"
        }
    }
}
```

- **결과 조립 예시**:
    - 제목 (`title_loc_key` = `"notification.chat.title"`, `title_loc_args` = `["홍길동"]`) ➡️ **"홍길동"**
    - 본문 (`loc_key` = `"notification.chat.message"`, `loc_args` = `["오늘 회의 참석하시나요?"]`) ➡️ **"오늘 회의 참석하시나요?"**
