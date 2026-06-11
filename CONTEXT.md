# Chatic

Chatic is an open-source chat product delivered as a family of clients (web, admin, mobile, desktop) over a shared real-time backend. This glossary fixes the language the team uses so the same word means the same thing across every client.

## Platform Clients

**App Runtime**:
The platform-agnostic chat engine — data repositories, real-time sync, socket connection, and auth bootstrap — shared by every client. It owns _how the app works_, not _how it looks_.
_Avoid_: core, infra, shell logic

**Bridge**:
The message channel between a native host and the web content it hosts. The host fulfills capability requests (notifications, badge, storage, deep links); the web side feature-detects what the host supports via a handshake.
_Avoid_: IPC layer, native module

**Shell**:
A native host that wraps web content and supplies platform capabilities through the Bridge. Each platform has one: the Mobile Shell (React Native) and the Desktop Shell (Electron). A Shell owns windows, OS integration, and native capabilities — never product UI.
_Avoid_: wrapper, 껍데기, container app

**Desktop Web**:
The web application built specifically for desktop layout (multi-panel, wide). It is deployed and loaded remotely by the Desktop Shell — a sibling of the mobile/web clients, not a variant of them.
_Avoid_: electron app, desktop frontend

**Capability Skew**:
The version gap that arises when a remotely-loaded Web client and its Shell are deployed independently and may speak different Bridge versions. Resolved by the handshake, not assumed away.

## Core Chat Domain

**Cloud**:
An isolated tenant boundary. A user's identity, places, and channels are scoped to a Cloud; switching Cloud re-scopes the whole session.
_Avoid_: tenant, org, server

**Default Cloud**:
The broker-hosted relay tenant (`id: 'default'`) that exists before any subscription. A user reaches it through a Guest Session — no Invite Code, no email, no Place to join — and it hosts their Self Channel from first launch. Distinct from a subscribed Cloud, which is a dedicated per-email deployment with its own URL.
_Avoid_: relay, broker tenant, public cloud

**Guest Session**:
A session established by device registration alone, against the broker, with no Invite Code and no email. Scoped to the Default Cloud. The default first-launch state on every client that supports it.
_Avoid_: anonymous login, temp account, device login

**Place**:
A workspace within a Cloud that groups channels and members. The unit a user joins via an Invite Code.
_Avoid_: site, space, room

**Channel**:
A conversation stream inside a Place that members exchange Messages in.
_Avoid_: chat room, group

**Self Channel**:
The solo Channel (`stereo: 'self'`) auto-present in the Default Cloud — the user's private space, available from first launch without any join. One per Guest Session.
_Avoid_: my chat, notes to self, default room

**Message**:
A single entry posted to a Channel. Carries pending / failed / sent state until acknowledged.
_Avoid_: chat, bubble

**Invite Code**:
The credential that admits a user to a Place (and its subscribed Cloud). One way in — not the only one: a client may instead start in a Guest Session on the Default Cloud. Distinct from social OAuth.
_Avoid_: join link, token

## People & Identity

**Profile**:
The signed-in user's own account view, rich with their own data (name, email, user id). Rendered as a full page. Editable scope is the user's own data only.
_Avoid_: my page, account settings

**Profile card**:
A read-only popover shown when you click another member's avatar or name in a Message or member list. Backed only by the fields the server returns for other users — avatar, name, nick — never email or phone. It is not the self Profile and must not imply data the server doesn't expose.
_Avoid_: user modal, hovercard, mini-profile

## Place Profiles (per-place identity)

**Global Profile**:
A user's canonical, cross-Place identity — `name` / `nick` / `thumbnail` on the user record. One per user, the same in every Cloud and Place. The fallback identity when no Place Profile applies. On the client it is the `user` cache (IndexedDB, `{cid,uid}`-scoped) — per ADR 0006 the single source for author names. (The self-account _page_ is still just "Profile"; "Global Profile" names the identity data, not the screen.)
_Avoid_: canonical user, base profile

**Place Profile**:
A user's display identity scoped to one Place — `nick` / `thumbnail` plus an `active` flag. One per `{Place, user}`. Lets a user present a different nick/avatar per Place. Stored on the client in a dedicated `profile` cache, never merged into the Global Profile record. The API names it "site profile" (`sid`); the product term is Place Profile.
_Avoid_: site profile, multi-profile, alias

**Display Profile**:
The nick/thumbnail actually rendered for a user in the current Place — `placeProfile[uid] ?? globalProfile`, resolved field-by-field at render time. Not a stored object; a render-time merge. Applied uniformly everywhere a user shows (Messages, member roster, self).
_Avoid_: merged profile, effective profile

**active**:
Whether a Place Profile is the live display identity for its Place. `true` → use it. `false` → a _reset to Global Profile fallback_, not a deletion: the record persists with its nick/thumbnail and can be re-activated. Changing only nick/thumbnail does not auto-activate; `active` is set explicitly.
_Avoid_: enabled, deleted

**Reachable users**:
The users whose Place Profiles the current user may see in the current Place — the channel-member union plus self. The sync op returns their changed Display Profiles.
_Avoid_: visible users, audience

**Reset delta**:
In a profile sync response, `placeProfile[uid] = null` — "this Place Profile went inactive; drop it from the client cache and fall back to Global Profile". Distinct from a _missing key_, which means "no change". Apply must be idempotent (duplicate deltas allowed).
_Avoid_: tombstone, deletion

**Sync cursor (`syncedAt`)**:
The server watermark returned by a profile sync, sent back as the next `since`. Server-issued — never the client's local clock. The catch-up path on Place-switch, app start, and reconnect. (The realtime `invalidate` hint in the spec is **not emitted by the backend yet**, so these triggers are the only ones today.)
_Avoid_: timestamp, last-sync

## Threads

**Thread**:
A focused conversation hanging off one Channel Message. Flat — one level only: a Thread has a root and its direct Replies, never replies to replies. The backend models a Thread with nothing but a `parentId` on each Reply; everything else (membership, count, ordering) is derived on the client.
_Avoid_: subchat, conversation, comments

**Thread Root**:
The Channel Message a Thread hangs off — the first message of the Thread and the only message a Reply points its `parentId` at. A Thread Root stays in the main Channel feed; its Replies do not.
_Avoid_: parent, head, anchor

**Reply**:
A Message that belongs to a Thread rather than the main Channel flow (`parentId` set to its Thread Root). A Reply always points at the Thread Root, never at another Reply. A Reply is hidden from the main Channel feed and appears only inside the Thread Panel.
_Avoid_: comment, child message

**Reply Count**:
The number of Replies under a Thread Root, surfaced on the root's row in the Channel feed. Client-derived from the Messages currently loaded, so it can under-count a long-idle Thread until more history is loaded — the server exposes no reply aggregate (see ADR 0008).
_Avoid_: thread count, comment count

**Thread Panel**:
The right-side pane showing a Thread Root and its Replies with its own composer. One of the Channel's trailing panes; mutually exclusive with the channel-settings panel (one trailing pane open at a time).
_Avoid_: thread sidebar, reply pane, drawer
