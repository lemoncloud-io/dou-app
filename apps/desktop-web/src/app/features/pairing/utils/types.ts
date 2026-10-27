import type { runtime } from '@chatic/app-runtime';

// The wire types are read off the repositories this app already depends on, rather than imported
// from the HTTP layer: desktop-web does not reference `@chatic/http`, and the shapes it needs are
// exactly what the repositories hand back.
type Repositories = ReturnType<typeof runtime.data.useRuntimeRepositories>;
type PairingRepository = Repositories['pairing'];
type UserRepository = Repositories['user'];

/** What an approval lets the requester into: the whole account (`relay`) or one cloud. */
export type PairingTarget = Parameters<PairingRepository['approvePairing']>[1];
/** A code looked up on the approving device. */
export type PairingCheck = Awaited<ReturnType<PairingRepository['checkPairing']>>;
/** One row of the pairings this account approved. */
export type PairingListItem = Awaited<ReturnType<PairingRepository['listPairings']>>['list'][number];
/** One row of this account's devices on the active slot. */
export type DeviceEntry = Awaited<ReturnType<UserRepository['listDevices']>>['list'][number];
