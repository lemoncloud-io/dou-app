import { cloudStore } from './stores';
import { getActiveSessionUser, getRelaySessionUser, patchRelaySessionUser } from './contextStore';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
} from './types';
import { sessionContextStore } from './contextStore';

export const getCloudSessionContext = (): CloudContext => sessionContextStore.getCloudContext();

export const getIdentityContext = (): IdentityContext => sessionContextStore.getIdentityContext();

export const getCloudSessionSnapshot = (): CloudSessionSnapshot | null => sessionContextStore.getCloudSessionSnapshot();

export const getActiveServerContext = (): ActiveServerContext =>
    sessionContextStore.getGlobalSessionContext().activeServer;

export const getGlobalSessionContext = (): GlobalSessionContext => sessionContextStore.getGlobalSessionContext();

// The active session token's user fields — the synchronous seed for useProfileFacts.
export { getActiveSessionUser };

// The RELAY token's user fields, and the patch that writes them back — the account-level profile
// source, which must not follow the active slot into a cloud. See contextStore for why the local
// cache cannot serve this.
export { getRelaySessionUser, patchRelaySessionUser };

/**
 * The COMMITTED cloud id — the cloud whose tokens are actually in the store, as opposed to
 * `getCloudSessionContext().cloudId`, which is the SELECTED id and flips optimistically at the start
 * of a switch (ADR-0070 결정 7의 세 뷰 중 `committed`).
 *
 * Read off the delegation token rather than recorded separately: `switchCloudSession` writes the
 * delegation token only when the exchange SUCCEEDS, and leaves it untouched on failure/rollback, so
 * its `cloudId` already is "the cloud we are committed to". That also means no backfill — every
 * existing session already has this field (설계문서 §리스크 4가 우려한 소급 마이그레이션 불필요).
 *
 * `null` means no cloud is committed (relay/default).
 */
export const getCommittedCloudId = (): string | null => cloudStore.getDelegationToken()?.cloudId ?? null;
