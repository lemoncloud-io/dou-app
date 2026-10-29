# ADR-0239: Korean screen copy follows the product glossary

> Status: Accepted · Decided: 2026-10-27
> Scope: `apps/web/public/locales/ko/translation.json` · `apps/landing/src/i18n/locales/ko.json`
> Supersedes: the "Korean 두유 홈 / English DoU Home" split in
> [ADR-0014](./0014-home-screen-figma-visual-refinement.md), and the line "`channelList.selfChannel`: ko
> `나와의 채팅` stays" in [ADR-0040](./0040-self-chat-title-and-profile-setup-nudge.md). The rest of both
> decisions stands.

## Context

The Korean copy of the phone app had grown one screen at a time. As a result, it named the same thing
several ways:

- A room was `채팅방` on most screens and `채널` on loading and error lines.
- A person in a cloud was `멤버`, the cloud's owner was `오너`, and a thread reply was `댓글`.
- The self chat was `나와의 채팅` in the list and `Self Chat` as the name placeholder.
- Three subscription states shared overlapping words:
    - a cancelled-but-paid subscription was `이용 종료 예정`;
    - a cloud over the allowance was `보류 중`;
    - an account an administrator blocked was `이용 제한`. That is the same word the cloud list uses for
      a cloud over the allowance.

The product team keeps a glossary that fixes one Korean term for each concept. The design files use
those terms too. Two earlier decisions in this repo had chosen differently on two of the words:

- ADR-0014 kept `두유 홈` in Korean, against the design, which shows `DoU Home` in both languages.
- ADR-0040 kept `나와의 채팅`.

## Decision

The Korean copy uses one term per concept, the glossary's.

| Concept                           | Was                        | Is                            |
| --------------------------------- | -------------------------- | ----------------------------- |
| a room                            | `채팅방`, `채널`           | `대화방`                      |
| the chat tab, the act of chatting | `채팅`                     | `대화`                        |
| a person in a cloud or room       | `멤버`                     | `친구`                        |
| the subscriber who owns a cloud   | `오너`                     | `소유자`                      |
| the self chat                     | `나와의 채팅`, `Self Chat` | `나와의 대화`                 |
| a reply in a thread               | `댓글`                     | `답글`                        |
| the relay home                    | `두유 홈`                  | `DoU Home`, in both languages |
| a group room                      | `그룹 방`, `그룹 대화방`   | `그룹방`                      |
| the person who sent an invite     | `초대한 사람`              | `초대자`                      |
| clouds the user was invited into  | `초대된 클라우드`          | `초대받은 클라우드`           |
| the subscription allowance unit   | `계정`                     | `클라우드`                    |
| auto-renew off, still paid        | `이용 종료 예정`           | `종료 예정`                   |
| a cloud over the allowance        | `보류 중`, `이용 제한`     | `이용 제한`                   |
| blocked by an administrator       | `이용 제한`                | `이용 정지`                   |
| plan names on the cloud guide     | `FREE`, `PRO`              | `Free`, `Pro`                 |

A few confirmation dialogs and toasts also take the design's sentences: leaving and deleting a room,
declining an invite, and reporting.

The Korean all-read receipt becomes `읽음 N`. It keeps the read count, and the dropped `안읽음` segment
is what signals that nobody is left. The English label stays `Read by all`.

Only values change, plus three new keys:

- The cloud management screen gets its own empty-state copy. It used to borrow the subscription list's
  "no subscription" line, which was the wrong statement on a screen about clouds.
- The leave toast gets its own key. The old one was also the "has left" label on a member row, and
  that label keeps its short wording.

The English locale is unchanged.

## Alternatives

- **Keep `두유 홈` and `나와의 채팅`.** Two words would then stay out of line with the design and with
  every other screen. A user would meet both forms in one session: `DoU Home` in the design's
  illustrations, `두유 홈` in the header.
- **Change the English copy in the same pass.** The English words already map one to one. Rewording
  them would only churn the end-to-end tests that select by English text.

## Consequences

- **Desktop is left behind on purpose.** Its screens are modelled on channels throughout, so swapping
  words there would not make the copy consistent. Until it is redesigned, the same receipt reads
  `미확인` / `모두 읽음` on desktop and `안읽음` / `읽음 N` on the phone. (Desktop has since dropped the
  receipt altogether — [ADR-0251](./0251-desktop-shows-no-per-message-read-receipt.md).)
- **Some uppercase pills stay.** The FREE/PRO pills in the header, the menu and the plan card come from
  the UI kit's default label, not from a locale key. Only the cloud guide's badges changed.
- **Some keys keep their old Korean words for now.** Keys owned by other in-flight work still read
  `채팅방`: the room kick dialog, the place-removal dialog, and the cancel-scheduled cloud notice. The
  debug token screen keeps `멤버`. A grep for the old terms shows those lines, and nothing else.
