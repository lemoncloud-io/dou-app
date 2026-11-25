import type { runtime } from '@chatic/runtime-react';

type Repositories = ReturnType<typeof runtime.data.useRuntimeRepositories>;
type PairingRepository = Repositories['pairing'];
type UserRepository = Repositories['user'];

export type PairingTarget = Parameters<PairingRepository['approvePairing']>[1];
export type PairingCheck = Awaited<ReturnType<PairingRepository['checkPairing']>>;
export type PairingListItem = Awaited<ReturnType<PairingRepository['listPairings']>>['list'][number];
export type DeviceEntry = Awaited<ReturnType<UserRepository['listDevices']>>['list'][number];
