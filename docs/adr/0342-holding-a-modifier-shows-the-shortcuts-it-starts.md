# ADR-0342: Holding a modifier shows the shortcuts it starts

> Status: Accepted · Decided: 2026-11-18 · Implemented: `feat/desktop-shortcut-hints`
> · Scope: `apps/desktop-web/src/app/features/chat/components/ShortcutHintBar.tsx` ·
> `apps/desktop-web/src/app/features/chat/hooks/useModifierHold.ts` ·
> `apps/desktop-web/src/app/features/chat/utils/modifierHold.ts`
> · The module doc is [keyboard.md](../../apps/desktop-web/docs/chat/keyboard.md)

## Context

Desktop gained Back and Forward on ⌘[ and ⌘] (ADR-0340). Like most of the app's chords, they have
no button on screen, so a reader finds them only in the shortcut sheet (? or ⌘/) or the Go menu, and
few open either. Nothing on screen tells a reader the keys exist, and ⌘, the key they all start
with, is the natural moment to say so.

## Decision

1. **Holding ⌘ (Ctrl off macOS) or ⌥ (Alt) on its own for half a second shows a line at the top of
   the window** listing what that key starts. Letting go, pressing any other key, clicking, or the
   window losing focus takes it away.
2. **The wait is the point.** ⌘ goes down on every ⌘C and ⌘K; a hint on each press would flash all
   day. A reader who holds the key and waits is asking what it does.
3. **One line, not a badge on each control.** Most of the chords have nothing to badge: the clouds a
   digit picks are inside a closed menu, and Back and Forward have no button. ⌘/ on the line leads to
   the full sheet.
4. **A chord that would do nothing reads faded**, so the line also says whether a press would act:
   Back and Forward on home when there is nowhere to step, and the chords only home binds (the
   switcher, search, the rail, the unread chord) on every other page.
5. **Only the modifiers that start a chord.** Ctrl on macOS starts none. The Windows key is not ours:
   the OS opens the Start menu over the app when it is released.

## Alternatives

- **Show on press, with no wait.** Flashes on every copy and paste.
- **Badges on each control while the key is held** (the way some browsers number their tabs). Of the
  six Mod chords, one has a control in view (message search); the rest would need a control made
  for the badge.
- **A one-time tip after the first room change.** Seen once, then gone; it says nothing about the
  other chords and nothing to the reader who missed it.
- **Buttons for Back and Forward in the header.** Visible to everyone, but a second way to do the
  same thing on a header that is already full, and it still leaves the other chords unseen.

## Consequences

- The line takes no pointer events and is hidden from screen readers; the shortcut sheet is the
  readable list. A reader who leans on ⌘ while thinking sees the line, which is the intended trade.
- On Windows, a lone Alt press and release can move focus to the menu bar; whether that gets in the
  way of the Alt line has not been checked on a Windows machine.
- The line lists the chords by hand, apart from the shortcut sheet. A new Mod chord has to be added to
  both.
