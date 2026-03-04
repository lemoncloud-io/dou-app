# Deep Linking Assets

딥링크 시스템 구성에 필요한 에셋들입니다.

## 파일 구조

```
deep-linking-assets/
├── README.md                    # 이 파일
├── firestore.indexes.json       # Firestore 인덱스 설정
├── firestore.rules              # Firestore 보안 규칙 (있는 경우)
└── firebase-functions/          # Cloud Functions
    ├── index.ts                 # 만료된 링크 정리 함수
    ├── package.json
    └── tsconfig.json
```

---

## 1. Firestore 인덱스 배포

### 방법 1: Firebase CLI

```bash
# Firebase 프로젝트 루트에서
cp docs/deep-linking-assets/firestore.indexes.json firestore.indexes.json
firebase deploy --only firestore:indexes
```

### 방법 2: Firebase Console (UI)

1. Firebase Console → Firestore Database → 인덱스 탭
2. "복합 인덱스 만들기" 클릭
3. 설정:
    - **컬렉션 ID**: `deferredDeepLinks`
    - **필드 1**: `fingerprint` (Ascending)
    - **필드 2**: `expiresAt` (Descending)

---

## 2. Cloud Functions 배포

만료된 deferred deep link를 자동으로 정리하는 함수입니다.

### 설치 및 배포

```bash
# 1. Firebase Functions 폴더로 이동
cd docs/deep-linking-assets/firebase-functions

# 2. 의존성 설치
npm install

# 3. 빌드 및 배포
npm run deploy
```

### 함수 목록

| 함수명                            | 타입      | 설명                               |
| --------------------------------- | --------- | ---------------------------------- |
| `cleanupExpiredDeferredLinks`     | Scheduled | 매시 정각에 실행, 만료된 링크 삭제 |
| `cleanupExpiredDeferredLinksHttp` | HTTP      | 수동 트리거용 엔드포인트           |

### 로그 확인

```bash
firebase functions:log
```

---

## 3. Firestore 보안 규칙 (권장)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deferred deep links - 웹에서 쓰기, 앱에서 읽기/삭제
    match /deferredDeepLinks/{docId} {
      // 누구나 생성 가능 (랜딩 페이지에서)
      allow create: if true;

      // fingerprint가 일치하면 읽기/삭제 가능
      allow read, delete: if true;

      // 수정은 불가
      allow update: if false;
    }
  }
}
```

**주의**: 위 규칙은 기본 예시입니다. 프로덕션에서는 요청 레이트 제한, 문서 크기 제한 등 추가 보안 조치가 필요할 수 있습니다.

---

## 4. 랜딩 페이지 배포

- **Production**: `libs/deeplinks/src/landing-page/index.html` → `app.chatic.io`
- **Development**: `libs/deeplinks/src/landing-page/index.dev.html` → `app-dev.chatic.io`

### Firebase Hosting 설정 예시

```json
{
    "hosting": {
        "public": "public",
        "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
        "rewrites": [
            {
                "source": "**",
                "destination": "/index.html"
            }
        ]
    }
}
```
