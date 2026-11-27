# ADR-0382: Desktop native has its own Rust engine, held to the TS engine by vectors and scenarios

> Status: Superseded by ADR-0387 · Decided: 2026-11-26 · Implemented: `feat/desktop-native-engine` (the headless engine and local MCP)
> · Scope: `apps/desktop-native/`

## Context

The TS engine libraries (`libs/auth`, `libs/transport`, `libs/data`, `libs/sync`, `libs/runtime-core`) serve the web, mobile and Electron apps. A native Rust app cannot call them without embedding a JavaScript runtime. The server rejects a request or a socket whose signature differs by one byte, so a second engine that drifts fails quietly and for good.

## Decision

Desktop native gets a desktop-only Rust engine: auth (request signing, token refresh, pairing), HTTP, the socket protocol, a SQLite cache and an outbox. Two engines, one in TS and one in Rust, are accepted.

Drift is detected by two tests, not removed:

1. **Contract vectors.** A TS script (`apps/desktop-native/vectors/generate.ts`) runs the TS code with fixed inputs and writes signatures, packets and HTTP requests to JSON. The Rust tests produce the same output and compare it byte for byte. A check regenerates the vectors and fails when the committed files differ.
2. **Scenarios.** Domain behaviour (unread counts, ordering, outbox, sync) is written as input and expected-state files taken from the TS tests, and the Rust engine is replayed against them as a black box.

The Rust checks run on macOS and Windows when a Rust path changes or when a TS source of the vectors or the strings changes.

## Alternatives

- **One Rust core for every client** (compiled to WebAssembly for the web and bound into the phone). Rewrites the engine under three shipping apps for the benefit of a fourth.
- **The TS engine in a Node or JS sidecar.** One engine, but a second runtime to ship, sign and update, and a process boundary under every call.
- **Vectors only.** Catches signing and wire drift and nothing in the domain behaviour above it.

## Consequences

- A change to a signed packet, a request shape or a tested domain rule in TS shows up as a red Rust check until the vectors or the scenarios are regenerated and the Rust side follows.
- The double cost of two engines stays; the tests make drift visible and do not make it free to fix.
