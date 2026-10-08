# shell

The frame around the conversation: the cloud and place rails, the sidebar column (or drawer), the
trailing panels, and how they share the window at each width. `DesktopLayout`
(`src/app/features/chat/components/DesktopLayout.tsx`) owns the frame. The shared pieces are in
`src/app/shared/components/` and `src/app/shared/hooks/`.

## Documents

- [trailing-panels.md](./trailing-panels.md): the thread, Mentions, Saved, settings, profile and debug
  panels. Their width, and how they cover the chat below 1280px.
- [cloud-rail.md](./cloud-rail.md): the cloud tiles, their names, and what a failed switch says.
- [place-rail.md](./place-rail.md): the place tiles, and making, editing and deleting a place from the rail.
- [layering.md](./layering.md): the one stacking scale.
