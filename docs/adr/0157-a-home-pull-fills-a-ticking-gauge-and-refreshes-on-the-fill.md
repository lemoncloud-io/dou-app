# ADR-0157: A home pull fills a ticking gauge and refreshes on the fill

> Status: Accepted · Decided: 2026-10-01
> · Scope: `libs/web-ui-kit/src/composites/layout/PullToRefresh.tsx` ·
> `apps/web/src/app/features/home/pages/HomePage.tsx` · `apps/web/src/app/bridge/haptics.ts`
> · Amends: [ADR-0146](./0146-haptics-are-played-by-the-shell.md)'s consequence that a haptic is "a
> tick per gesture" — a pull now plays a run of them
> · The module doc is [apps/web home](../../apps/web/docs/feature/home/README.md#pull-to-refresh)

## Context

Home's pull-to-refresh showed a small disc whose ring filled with the pull. Past 64px the ring
completed, one `impact` haptic played, and **letting go** refreshed. The pull was felt once, at the
threshold, and the threshold was a promise: the refresh it announced only started at the release,
a beat later.

The product ask was a pull that is felt filling up — haptics in quick succession while the gauge
fills, the DoU character as the gauge, and the refresh starting when the gauge is full.

ADR-0146 put haptics on the shell bridge and noted that each one costs a bridge message, "fine for a
tick per gesture; this is not a channel for continuous feedback". A ticking gauge is more than one
tick per gesture, so it needs its own record.

## Decision

1. **The gauge fills in eight steps.** Each of the first seven crossed on the way down plays a
   `selection` tick; the eighth is the fill and plays `impact`. A step is 8px of pull, so a full pull
   is at most eight bridge posts spread over the length of the drag — not a stream, and far below
   anything the bridge notices. Pulling back and down again ticks again, like a ratchet, but a step
   only re-arms once the pull is 3px clear of its boundary, so a finger resting on a boundary does
   not buzz with every tremble.
2. **The refresh starts on the fill, finger still down.** The strongest feedback then lands at the
   moment the refresh actually begins, instead of announcing one that waits for the release. Once a
   touch has filled the gauge it makes no more ticks; on release the list settles into the
   indicator's slot, or straight back if the refresh already ended.
3. **Only one haptic request is ever in flight.** ADR-0146's first haptic of a session is a request,
   to learn whether the shell knows the message. A burst of ticks on the first pull would otherwise
   send a burst of requests, each answered across the UI thread mid-gesture. While that first answer
   is outstanding, further haptics are dropped.

## Consequences

- **Backing off no longer cancels.** Once the gauge is full the refresh is running; pulling back up
  does not undo it. A pull that stops short of full still refreshes nothing.
- **A pull costs up to eight bridge posts** where it cost one. They are one-way posts after the first
  answer, so nothing comes back across the UI thread.
- **The first pull of a session may miss a few ticks** while the probe is out. Every later pull plays
  them all.
- The kit's `onArm` callback is replaced by `onTick` and `onFill`; home is its only caller.

## Alternatives

- **Keep refreshing on release, tick while filling.** Rejected: the full gauge would still be a
  promise, and the `impact` would mark the fill rather than the refresh — the thing the ask wanted
  to line up.
- **Tick continuously, on every frame of the pull.** Rejected: that is the continuous channel
  ADR-0146 warned against, and a stream of selection ticks blurs into a buzz.
- **Post optimistically while the first request is out.** Rejected for the reason ADR-0146 rejected
  posts-only: an old shell's `NOT_FOUND` for a post comes back to nobody.
- **More steps.** Rejected for now: eight gives a tick every ~16px of finger travel, which reads as a
  run without merging. The count is one constant, `PULL_TO_REFRESH_STEPS`, if it needs tuning on a
  device.
