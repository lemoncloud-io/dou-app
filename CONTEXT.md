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

**Place**:
A workspace within a Cloud that groups channels and members. The unit a user joins via an Invite Code.
_Avoid_: site, space, room

**Channel**:
A conversation stream inside a Place that members exchange Messages in.
_Avoid_: chat room, group

**Message**:
A single entry posted to a Channel. Carries pending / failed / sent state until acknowledged.
_Avoid_: chat, bubble

**Invite Code**:
The credential that admits a user to a Place (and its Cloud). The primary login path — distinct from social OAuth.
_Avoid_: join link, token
