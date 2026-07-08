# Deploy

모바일 앱(iOS/Android × dev/prod, 총 4개 스토어 앱)을 로컬 맥에서 명령 한 번으로 스토어에
업로드하는 파이프라인을 다룬다. 심사 제출/출시 버튼은 자동화하지 않는다 — 업로드까지만 자동이고,
그 뒤는 App Store Connect / Play Console에서 사람이 결정한다.

## 배포 대상

| 앱           | 식별자              | 채널                |
| ------------ | ------------------- | ------------------- |
| iOS dev      | `io.chatic.dou.dev` | TestFlight (dev 앱) |
| iOS prod     | `io.chatic.dou`     | TestFlight          |
| Android dev  | `io.chatic.dou.dev` | Play 비공개 테스트  |
| Android prod | `io.chatic.dou`     | Play internal 트랙  |

## 최초 1회 세팅

1. **fastlane 설치** — `brew install fastlane` (Homebrew fastlane은 자체 Ruby를 내장하므로
   시스템 Ruby 버전과 무관하다.)
2. **자격증명 파일 준비** — `apps/mobile/fastlane/` 디렉터리에 그대로 둔다
   (`.p8`/`.json` 모두 gitignore 확인됨, 커밋되지 않는다)
    - App Store Connect API Key `.p8` 파일 + Key ID + Issuer ID
    - Play Console 서비스 계정 JSON **2개** — Android dev/prod는 서로 다른 Google Cloud
      계정이므로 각 계정의 JSON이 필요하다 (`PLAY_JSON_KEY_PATH`, `PLAY_JSON_KEY_PATH_DEV`)
    - Android release keystore (`chatic-dou.keystore`) + 비밀번호
3. **env 작성** — `apps/mobile/fastlane/.env.example`을 `.env`로 복사해 채운다.
    - 키 파일 경로는 파일명만 쓰면 `fastlane/` 기준으로 해석된다. 절대경로/`~`도 가능.
    - dev 앱이 별도 Apple 계정을 쓰면 `*_DEV` 변수를 채운다. 비워두면 공용 값으로 폴백한다.
    - Play 비공개 테스트 트랙 이름이 콘솔에서 `alpha`가 아니면 `PLAY_TRACK_DEV`를 조정한다.

## 배포 플로우

```bash
# 1. 버전 올리기 — iOS(pbxproj)/Android(build.gradle) 4개 필드를 한 번에 동기화하고 커밋
yarn mobile:version patch          # major | minor | patch
yarn mobile:version build          # 같은 버전 재업로드용: 빌드번호만 +1

# 2. 배포 — 업데이트 메시지 입력(-m 생략 시 프롬프트) → 빌드 → 스토어 업로드
yarn mobile:deploy:dev -m "채팅 이미지 업로드 버그 수정"
yarn mobile:deploy:prod -m "0.19.1 안정성 개선"

# 플랫폼 하나만
yarn mobile:deploy:ios:dev -m "..."
yarn mobile:deploy:android:prod -m "..."
```

- 입력한 메시지는 TestFlight "What to Test"와 Play 릴리즈 노트(`PLAY_LOCALE`, 기본 en-US)에
  들어간다. 릴리즈 노트는 영어로 작성한다.
- 스토어는 같은 빌드번호(versionCode/CFBundleVersion) 재업로드를 거부하므로, 업로드 실패 후
  재시도가 아니라 **성공한 업로드를 다시 올리려면** `yarn mobile:version build`가 선행돼야 한다.
- iOS는 changelog 반영을 위해 빌드 프로세싱 완료를 기다린다(수 분~수십 분 소요될 수 있음).

## 구성 요소

| 파일                            | 역할                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------ |
| `scripts/version-mobile.js`     | 버전 범프. Android `build.gradle`을 단일 소스로 삼고 iOS와 어긋나면 중단. 테스트: `yarn mobile:version:test` |
| `scripts/deploy-mobile.sh`      | 배포 진입점. 메시지 수집 → fastlane 레인 디스패치                                                            |
| `apps/mobile/fastlane/Fastfile` | `ios dev                                                                                                     | prod`, `android dev | prod` 4개 레인 (빌드 + 업로드) |
| `apps/mobile/fastlane/.env`     | 자격증명 (gitignore). 템플릿: `.env.example`                                                                 |

## 트러블슈팅

- **iOS 서명 실패** — 프로젝트는 Automatic signing이며, 레인이 `-allowProvisioningUpdates`와
  ASC API 키로 서명 자산을 갱신한다. 실패하면 Xcode에서 해당 스킴을 한 번 열어 서명 상태를 확인한다.
- **Play 업로드 403** — 서비스 계정이 해당 패키지(특히 dev 앱)에 초대되어 있는지 Play Console
  → 설정 → API 액세스에서 확인한다.
- **버전 어긋남 에러** — `version-mobile.js`가 "out of sync"로 중단하면 누군가 한쪽 플랫폼만
  수동 수정한 상태다. 두 파일의 버전 필드를 손으로 맞춘 뒤 재시도한다.
