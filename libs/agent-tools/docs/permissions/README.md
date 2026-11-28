# Permissions

Every tool call passes `authorize` before it reaches the backend. A refusal throws an `AgentToolError` with a code and
never calls the backend.

`settings.json` has the shape of the Rust `dou-control` settings: `{ "tier": "read", "allowRooms": [], "rateLimit": {
"perMinute": 10, "perHour": 100 } }`. The default tier is `read`.

| Tier            | Reads                                       | Writes                                                |
| --------------- | ------------------------------------------- | ----------------------------------------------------- |
| `off`           | refused with `tier_off`                     | refused with `tier_off`                               |
| `read`          | allowed; room content only for `allowRooms` | refused with `tier_read_only`                         |
| `write`, `full` | allowed; room content only for `allowRooms` | allowed in `allowRooms` only, else `room_not_allowed` |

- Missing or broken settings give the default; an unknown tier gives `off`.
- Writes spend the rate budget (`rate_limited` past `perMinute` or `perHour`); a write refused for its tier or room
  spends nothing. Reads have a fixed higher budget.
- `message_send`, `thread_reply` and `mention_send` put `[AI] ` in front of the text exactly once, so readers can tell
  an agent sent it.
