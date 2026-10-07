# Channel settings

The channel settings panel is the trailing panel opened from the room header, a sidebar row's menu
or the header's member chip (which lands it on the member list). The code is
`src/app/features/channels/components/ChannelSettingsPanel.tsx`; where it sits among the other
trailing panels is in [`../shell/trailing-panels.md`](../shell/trailing-panels.md).

## Sections

Top to bottom:

- **Channel name**, with Rename for the owner.
- **Members**, with a filter once the roster is longer than five, "Remove from channel" for the
  owner, and "Add members".
- **Notifications**: all messages, mentions only, or off. The choice is kept on this device first and
  synced to the server best-effort, so a failed sync does not undo it.
- **Channel ID**, group channels only (below).
- **Leaving and deleting**: Leave for everyone, Delete for the owner. Either one closes the panel and
  clears the selected room.

## Channel ID

A service that posts notifications into a channel (a webhook) is pointed at the channel by its id.
The web client shows that id in its address bar; the desktop app has none, so the panel shows it,
selectable as one piece, with a Copy button. Copy puts the id on the clipboard and the button reads
"Copied" for a moment, the same feedback as the User ID on the profile page (`useCopyToClipboard`).

A 1:1 and the self channel do not show it. Neither is somewhere a service posts to, and the panel
has no use for the id there.
