# Tools

Names, schemas and outputs follow the parked Rust `dou-mcp` crate, so existing MCP clients keep working.

| Tool              | Needs               | What it does                                                                                  |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `clouds_list`     | read                | The active cloud and the user id; the relay is `default`, the runtime relay slot.             |
| `rooms_list`      | read                | Rooms with unread count, plus whether each is readable and writable.                          |
| `messages_read`   | read, allowed room  | A page of messages, oldest first.                                                             |
| `thread_read`     | read, allowed room  | A thread parent and its replies.                                                              |
| `messages_search` | read, allowed rooms | Keyword search in one room or all allowed rooms; local cache only.                            |
| `unread_digest`   | read                | Unread messages of allowed rooms.                                                             |
| `room_members`    | read, allowed room  | Members of a room, named from its user roster; works without a place.                         |
| `settings_get`    | read                | The settings the gate is using.                                                               |
| `events_list`     | read                | Mentions, direct messages, replies to me and new messages after a cursor; allowed rooms only. |
| `events_wait`     | read                | Waits for an event after a cursor; returns empty on timeout.                                  |
| `message_send`    | write, allowed room | Sends text.                                                                                   |
| `thread_reply`    | write, allowed room | Replies to a message of the same room.                                                        |
| `reaction_set`    | write, allowed room | Adds or removes a reaction.                                                                   |
| `mention_send`    | write, allowed room | Sends text that mentions members.                                                             |

Message text, owner names, member names and room titles come from other people. Every such value in a result is
wrapped by `wrapUntrusted` in an `untrusted-message-content` envelope, and a closing tag inside the text cannot end it.
