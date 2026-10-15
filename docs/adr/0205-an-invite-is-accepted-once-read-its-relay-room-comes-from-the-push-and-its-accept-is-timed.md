# ADR-0205: An invite is accepted once it has been read, its relay room comes from the push, and its accept is timed per run

> Status: Accepted · Decided: 2026-10-15 · Implemented: `fix/invite-room-entry-speed`
> · Scope: apps/web `features/invite/accept` · apps/web `runtime/perf/inviteAcceptTrace` · libs/perf
> `invite_accept`
> · Takes up [ADR-0035](./0035-relay-invite-accepted-channel-resolution.md)'s follow-up 1 (the push
> fast path)
> · Adds a trace under [ADR-0200](./0200-state-writes-are-measured-per-wait-in-their-own-runs.md)'s
> forty-a-minute bound on traces every run carries
> · The module docs are [apps/web feature/invite](../../apps/web/docs/feature/invite/README.md),
> [relay-invite-accept.md](../../apps/web/docs/feature/invite/relay-invite-accept.md) and
> [apps/web observability/performance.md](../../apps/web/docs/observability/performance.md)

## Context

Entering a room through an invite on the web was reported as slow, at the Accept press. Both lanes
were reproduced on the dev server with two browser origins — one the inviter, one the invitee — with
socket frames and HTTP requests timestamped from the press.

- **Cloud invite, the pipeline itself is not slow.** A fresh guest reached the place-profile form
  1.7 s after Accept: `login-invite` 0.55 s, the cloud socket's connect, `device.save` and
  `auth.update` 0.6 s, `auth.switch` 0.33 s, `profile.get-mine` 0.15 s — every step a round trip the
  next one needs. A guest already in that cloud reached the room in 1.2 s.
- **Cloud invite, Accept was live before the invite was read.** The accept screen rendered while the
  `hello/invite-code` lookup was still out, and the pipeline reads the cloud, place and room from that
  lookup. Pressed on a cold start before it answered (0.26 s on dev; longer on a slow link or a cold
  server), `login-invite` went through, every later step no-oped for want of an id, and the invitee
  landed on home outside the cloud — no room, no cloud in the switcher, and the invite already spent
  on the server. Opening the link again recovered. From the outside this reads as "accepted, and the
  room never came".
- **Relay 1:1, tier 2 never found the room.** ADR-0035 resolves the room in three tiers: the accept's
  own `channelId`, then `invite.get` probes at `[0, 1500]` ms, then a watch on the channel list. On the
  dev server neither the accept nor any probe carried `channelId` — the invite view does not fill it —
  so the probes were pure delay and every room was found by tier 3's first pull, 1.75 s after the accept
  answered, about three quarters of a second after the room existed. Tier 3 also needs an active place;
  a relay link opened in a fresh browser tab has none, so tier 3 gave up at once and the invitee was
  sent home with "your room is on its way".
- **The server already says when the room exists.** About a second after the accept answers (0.91 s
  and 0.97 s in two runs), the relay socket pushes `join.sync` for the inviter's join row in the new
  room, carrying its `channelId`. ADR-0035's follow-up 1 looked for a `channel.sync` push and left it
  unverified; what arrives first is this `join.sync`, ahead of the `channel.sync` pushes.
- **Firebase Performance could not see any of this.** `cloud_switch` and `site_switch` cover two cloud
  steps, but every other switch lands in the same rows and almost all of those are onto a socket that
  is already up: `cloud_switch` reads 50 ms at p90 and 61 ms at p95 on iOS for the week, and the
  console offers no percentile above 95. An accept is rare and cold, so it never reaches the tail the
  console shows. Nothing timed the relay lane at all.

## Decision

1. **Accept is offered only once the invite has been read.** The cloud accept screen holds on the
   loading screen until the lookup answers, and a lookup that fails shows the same notice dialog an
   accept failure would (400 or 404 → expired, anything else generic). The pipeline also refuses to start without the
   invite view, so no other caller can spend an invite with nothing to enter.
2. **The relay room is also taken from its `join.sync` push**, raced against tiers 2 and 3: a push for
   the inviter's join to a 1:1 room whose id names the inviter resolves the wait at once. The tiers are
   unchanged and still answer when no push comes; once the push wins, the probes stop and tier 3 is
   stopped or never started. When the tiers give up first — at once, with no active place — the push
   is still waited for until five seconds from the start of the hunt.
3. **`invite_accept` times one run of either pipeline**, from the press (or the step that resumes it)
   to the hand-over, with a `lane` attribute (`cloud` / `relay`). A run ends where the pipeline stops
   for a person — the phone verification, the place-profile form — with that as its outcome, and the
   step that resumes it starts a run of its own. Each step is a mark, so the console splits a run
   without a trace per step. A relay run also records which way the room was found (`room`:
   `response`, `push`, `probe`, `list`, `none`), which is how production will say whether the push
   arrives there too.

## Alternatives

- **Disable the Accept button instead of holding the loading screen.** The screen's every field comes
  from the same lookup, so it would show an inviter-less card with a dead button — the state the relay
  lane already avoids with its own `loading` phase. Holding the loading screen matches that lane.
- **Let the pipeline fetch the invite itself when Accept is pressed early.** It would hide the bug at
  the cost of a second path into the same data, and the screen would still have offered an Accept for
  an invite it could not describe.
- **Probe `invite.get` more often.** Tried first, at half-second intervals for two seconds. It assumed
  the probes would see `channelId` once the room existed; they never did on dev, so it only postponed
  tier 3 by a further second.
- **Start tier 3 at once.** Its first pull lands before the room exists and the next one 3 s later,
  and it still gives up with no active place.
- **Replace the tiers with the push.** The push is measured on dev only, and ADR-0035's reason for not
  relying on it alone still holds for production until the trace's `room` attribute says otherwise.
  Racing keeps every path the flow had.
- **Trust any `join.sync` that names a room not seen before.** The reader's other rooms push join rows
  too. Requiring the inviter's own join, to a room whose id contains the inviter, keeps a push about
  another room from being taken for this one.
- **Rely on `cloud_switch` / `site_switch`, or add an attribute that marks an invite's switch.** The
  relay lane has no switch to mark, the cloud lane's login and profile lookup are outside both, and a
  marked switch would still be one row among thousands of warm ones.
- **A trace across the whole flow, forms included.** A form is paced by a person, and the native
  backend forgets a trace left open for two minutes. Ending at the form keeps every run measurable.

## Consequences

- What is gained:
    - An invitee can no longer spend an invite without entering it. A slow lookup now costs a longer
      loading screen instead of a silent landing outside the cloud.
    - The relay room opens about a second after the accept answers instead of 1.75 s, and a relay link
      opened in a fresh tab now opens the room rather than sending the invitee home to wait for it
      (measured on dev: push 0.91 s after the accept, room route 30 ms later).
    - The accept's time shows in the console, per lane and per step, in app builds, along with how
      often the push is what found the room.
- What is accepted:
    - The match leans on the room id's shape: a 1:1 room id is its two members' ids joined by `@`. If
      that changes, the push stops matching and the tiers answer as before; the trace's `room`
      attribute would show `push` disappearing.
    - With no active place the tiers give up about 1.6 s after the accept, and the spinner then waits
      for the push up to five seconds from the start. A server that never pushes costs those seconds
      before "the room is on its way"; dev pushed in under one.
    - `invite_accept` is uncapped. ADR-0200 bounds a trace every run carries to fit under the forty a
      minute the request-trace runs already reach, against the 300-per-ten-minutes budget. An accept
      is a few runs per person, ever — one per press, plus one per resumed step — so it adds a handful
      to one minute of one run and does not raise any run's worst minute in practice.
    - A plain browser tab records nothing, as for every trace: the numbers come from app builds. The
      web-only reproduction above is what the decision rests on.
- When to reverse: if the backend answers `invite.accept` with the room's id, tier 1 answers every
  accept and decision 2 stops mattering.
