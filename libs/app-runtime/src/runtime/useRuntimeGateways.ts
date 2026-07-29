import { getDataManager } from '../data/runtime';
import type { DirectGateways } from '../data/types';

/**
 * The socket gateways the app calls directly, without a repository in front of them.
 *
 * Relay 1:1 invites are polled and never persisted, so ADR-0033 keeps them out of repositories-v2;
 * the phone/social identity packets are one-shot commands with nothing to cache either. Both are
 * already pinned to the relay slot by the composition root, so callers never pick a destination.
 * Everything else in the bundle stays private — read it through `useRuntimeRepositories`.
 */
export const useRuntimeGateways = (): DirectGateways => getDataManager().getGateways();
