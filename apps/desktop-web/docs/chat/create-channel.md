# Creating a channel

The place rail's "+" opens `CreateChannelDialog` (`src/app/features/channels/components/`). Its name
field is shared with rename (`ChannelNameField`), and both use one rule, `channel name`: 2 to 20
characters after trimming. They used to disagree (rename enforced the range, create accepted anything
non-empty), so a channel made outside the range could not be renamed to itself and the server's
rejection was the first the person heard of it.

- **A submit with a bad name shows why.** Enter on a one-character name used to do nothing at all; the
  length rule now becomes the error. The field shows a counter because the input truncates silently at
  the maximum, and the counter is what tells someone their last keystrokes went nowhere.
- **Public and private each say what they do.** A bare pair of options names no consequence, so each
  option carries a line of its own.
- **The dialog cannot be closed while the channel is being made** (Escape, the close button and the
  backdrop are ignored): closing then would drop a failure message with nobody to read it. The same
  holds for rename, add members and the invite sender.
- **The host opens the new channel, not the dialog.** The dialog hands the new id up (`onCreated`) and
  the home page selects it once the channel list holds it. Selecting inside the dialog raced the list:
  the id was not in it yet, so the host's auto-select put the previous channel back.

## Why a creation failed

`createChannelFailure` sorts a failure into four kinds, each with its own line, because only some of
them are fixed by trying again:

| Kind      | Meaning                                 | The dialog says                                                                                |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `limit`   | the place is full                       | more room comes with a subscription; desktop does not sell one, so it points at the mobile app |
| `denied`  | this account may not make channels here | trying again changes nothing                                                                   |
| `network` | the server was not reached              | try again                                                                                      |
| `other`   | anything else                           | try again (it may pass on a second try)                                                        |

A limit's wire text has not been captured from the server, so it is matched on the words a cap is
reported with (`LIMIT`, `EXCEED`, `QUOTA`) and tested before the status: a cap can arrive as a 403, and
reading that as `denied` would hide the one answer that helps. Ids in the wire text must not look like a
cap. The raw text is logged and rides the failure toast under the sentence
([failure toasts](../shell/failure-toasts.md)).
