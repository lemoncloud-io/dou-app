# Room names

A room has one name everywhere it is shown: the sidebar, the chat header, the composer placeholder,
the Quick Switcher, search, and the "Back to …" bar. Each of these used to name rooms its own way,
and several showed raw ids (`##1`, `#self`, `1000007`).

## The helpers

`shared/utils/channelLabel.ts`:

- `channelKind(channel)`: `channel`, `dm` or `self`.
- `bareChannelName(name)`: the name without leading `#`. A channel created as "#1" used to print
  "##1", because every surface added its own `#`.
- `channelLabel(channel, context)`: the name to show.
    - A channel shows its bare name.
    - A 1:1 shows the other person (the chain in [direct-messages.md](./direct-messages.md)).
    - The self channel shows the "You" label.
- `channelRef(kind, label)`: the label in running text. A channel gets one `#` ("Open #general"); a
  person does not.
- `cloudLabel(cloud, untitled)`: a cloud's name. A cloud with no name, or with the server's generated
  setup name (`#cloud/<n>/<n>`), reads "Untitled cloud".

`useChannelLabels(channels)` (`shared/hooks/useChannelLabels.ts`) binds `channelLabel` to the session
and the resolved profiles, and returns `labelOf(channel)`. Components call that, not `channelLabel`.

## Matching follows the label

The Quick Switcher ranks on the label (`rankChannels`), so a 1:1 is found by the person's name. It
used to match ids only.

## Composer placeholder

The placeholder names the room in the same words: "Message #general" for a channel, "Message Ada" for
a 1:1, and a note-to-self line in the self channel.

## One profile cache for every caller

Names come from `useCloudProfiles` (`shared/hooks/useAuthorNames.ts`), which keeps a session memo of
resolved profiles. A second caller used to miss any profile that another caller had cached first:
the memo write only bumped the tick of the caller that did the write. That is why the Quick Switcher
kept showing ids after the sidebar had resolved names. Every emission now writes the memo, and each
caller re-renders when the name or photo it shows has changed.

## Cloud tiles

A rail tile uses `cloudLabel`. A cloud whose setup failed says so in its label, before the click
fails.
