# account

> 대상: `apps/web/src/app/features/account`

## 책임

이메일 기반 **가입**과 **비밀번호 재설정** 흐름을 담당한다. 두 흐름 모두 이메일 → 인증코드 검증 → 비밀번호 설정의 다단계 구조이며, web-core `useVerifyAlias`로 백엔드 검증 서비스와 통신한다.

로그인 자체와 세션 위임은 [auth](../auth/README.md)가 담당한다. account는 "계정을 만들고 비번을 복구하는" 화면 묶음이다.

## 화면

| 페이지                    | 경로(`ROUTES.account.*`)               | 설명                                       |
| ------------------------- | -------------------------------------- | ------------------------------------------ |
| `SignupEmailPage`         | `/account/signup`                      | 가입 이메일 입력 → 인증코드 발송           |
| `SignupVerifyPage`        | `/account/signup/verify`               | 6자리 인증코드 입력(3분 타이머·재발송)     |
| `SignupPasswordPage`      | `/account/signup/password`             | 비밀번호 설정 → 계정 생성 완료             |
| `ResetPasswordEmailPage`  | `/account/reset-password`              | 재설정 이메일 입력(계정 존재 확인 후 발송) |
| `ResetPasswordVerifyPage` | `/account/reset-password/verify`       | 재설정 인증코드 입력                       |
| `ResetPasswordNewPage`    | `/account/reset-password/new-password` | 새 비밀번호 설정 → 재설정 완료             |

## 구조

```
features/account/
  pages/        # 위 6개 화면
  components/    # 재사용 폼 부품 (EmailInputPage, VerifyCodePage, SetPasswordPage, VerificationCodeInput, FloatingButton, DouLogo)
  constants/     # VERIFICATION_CODE_LENGTH(6), VERIFICATION_TIMER_SECONDS(180), MIN_PASSWORD_LENGTH(4)
  utils/         # isValidEmail, formatTime
  routes/        # AccountRoutes
  index.ts
```

`hooks/`·`types/`는 없다 — 인증 로직은 web-core 훅에 위임하고, 화면 상태는 페이지 로컬이다.

## 데이터 흐름

- **`useVerifyAlias`** (web-core) — 가입/재설정의 다단계 검증을 모두 처리한다. `mode`로 흐름을 구분: 가입은 `mode: 'signup'`, 재설정은 `mode: 'find'`. `step`으로 단계 진행: `send`(코드 발송) → `check`(코드 확인) → `confirm`/`change`(비번 확정).
- **`useFindAlias`** (web-core) — 재설정에서 발송 전 계정 존재 여부를 확인한다(이메일 등록 여부 노출을 줄이는 패턴).
- **`useSessionIdentity`** (web-core) — 가입 시 `uid`를 가져온다(가입 진입 전 익명 세션이 선행).

## 주요 결정/특이점

- **단계 간 상태는 `location.state`로 전달**한다(email/userId/code). URL 파라미터가 아니므로 뒤로가기 시 흐름이 초기화된다.
- **인증코드 3분 타이머** + 6자리 입력 완료 시 자동 진행.
- **폼 부품은 일반화**되어 있다(`translationPrefix` prop) — 가입/재설정이 같은 컴포넌트를 재사용한다.
- i18n 리소스는 원격 로드라 리포에 JSON이 없다.
