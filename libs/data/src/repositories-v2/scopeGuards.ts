import type { DataContext } from './types';

/**
 * Scope predicates — the "is this frame/write for the cloud we are actually on?" judgements that were
 * inlined at six call sites (ADR-0070 결정 7).
 *
 * **`data` owns them, not `session/scope`.** The ADR sketches `session/scope/predicates.ts`, but four
 * of the six call sites live inside `@chatic/data`, which is a leaf and cannot import
 * `@chatic/app-runtime` — so that home makes the consolidation impossible. Taking `DataContext` and
 * plain values as input keeps them pure, keeps `data` a leaf, and lets `session/scope` and
 * `socket/sync` be callers (설계문서 §session/scope).
 */

/**
 * True when the answering socket is bound to a DIFFERENT cloud than the active cache scope — the
 * optimistic window of a cloud switch, where `cid` has already flipped to the target but the socket
 * still serves the outgoing cloud.
 *
 * Writing that socket's data under the new `cid` poisons the target partition, which is why every
 * call site skips the cache write while this holds. `socketCid == null` means "no bound socket to
 * disagree with" and is therefore NOT foreign — a boot with no socket must still write its cache.
 *
 * The `|| 'default'` mirrors `getNormalizedContext`: an absent `cid` IS the relay/default partition,
 * so an unset `cid` against a bound `'default'` socket must compare equal, not foreign.
 */
export const isForeignContext = (context: DataContext): boolean =>
    context.socketCid != null && (context.cid || 'default') !== context.socketCid;

/**
 * True when work targeted at `targetCid` is still relevant to the currently bound socket.
 *
 * `targetCid == null` means "not cloud-scoped" — it applies to whatever is bound, so it is always
 * active. This is the sync-side counterpart to {@link isForeignContext}: same question, but asked
 * about an explicit target rather than about the ambient context.
 */
export const isCidActive = (targetCid: string | null, boundCid: string | null): boolean =>
    targetCid == null || targetCid === boundCid;
