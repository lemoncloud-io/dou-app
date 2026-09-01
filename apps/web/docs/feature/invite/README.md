# invite

> 대상: `apps/web/src/app/features/invite`

## 책임

**relay 1:1 초대**의 양쪽 끝을 담당한다 — 번호로 초대를 발급해 딥링크를 SMS로 넘기는 **발신자**
흐름과, 그 링크를 열어 수락/거절하는 **수신자** 흐름이다. 초대 코드는 자격증명이라 라우트는
`invite.id`로만 파라미터화하고 코드 원문은 패킷 본문과 딥링크에만 실린다.

그룹방의 "친구 추가"는 여기가 아니라 [channels/invite.md](../channels/invite.md)가 소유한다 —
다른 API(`user.invite`)를 쓰고 채널에 매인 흐름이다.

## 두 레인

| 문서                                               | 흐름                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [relay-invite-sender.md](./relay-invite-sender.md) | 발급 폼 · SMS 전달 · 대기 화면 · 취소/재발급 · **방에서 오는 재초대** |
| [relay-invite-accept.md](./relay-invite-accept.md) | 딥링크 진입 · 번호 인증 · 수락/거절 · 채널 진입                       |

## 화면

| 페이지              | 경로(`ROUTES.invite.*`)     | 설명                                                      |
| ------------------- | --------------------------- | --------------------------------------------------------- |
| `ContactInvitePage` | `/invite/contact`           | 이름+번호 발급 폼. route state로 **재초대 모드**도 겸한다 |
| `InviteWaitingPage` | `/invite/:inviteId/waiting` | 수락 대기 — 카운트다운·폴링·취소·재발급                   |
| `InviteAcceptPage`  | `/invite/accept`            | 수신자 진입점(딥링크). 공개 라우트                        |

## 이웃 문서

- 1:1 방 화면(상대 부재·재초대 CTA의 소유자) — [channels/dm-chat.md](../channels/dm-chat.md)
- 게스트 게이트·번호 인증 — [auth/phone-verification.md](../auth/phone-verification.md)
- 국가 코드·번호 검증 — [auth/international-phone-input.md](../auth/international-phone-input.md)
- 홈 목록의 초대 행 — [home/README.md](../home/README.md)
- 로컬 캐시(초대 목록) — [libs/app-runtime/docs/data/invite-local-cache.md](../../../../../libs/app-runtime/docs/data/invite-local-cache.md)
