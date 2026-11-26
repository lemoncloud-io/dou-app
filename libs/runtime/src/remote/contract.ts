import type {
    OnRuntimeHelloPayload,
    RuntimeHelloPayload,
    RuntimeOffer,
    RuntimeWireValue,
} from '@chatic/bridge-messages';

import type { RuntimeConnection } from '../engine/connection/runtimeConnection';
import type { SessionCommands } from '../engine/session/commands';
import type { RuntimeSync } from '../engine/sync/runtimeSync';
import type { SessionSnapshot } from '../engine/session/snapshot';
import type { CheckedCrossing } from './wire';

export const RUNTIME_CONTRACT_VERSION = 1;

export const RUNTIME_CONTRACTS: readonly number[] = [RUNTIME_CONTRACT_VERSION];

const isContractList = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every(entry => Number.isInteger(entry) && entry > 0);

export const chooseRuntimeContract = (page: readonly number[], shell: readonly number[]): number | null => {
    const shared = page.filter(version => shell.includes(version));
    return shared.length > 0 ? Math.max(...shared) : null;
};

export const readRuntimeOffer = (
    value: unknown,
    contracts: readonly number[] = RUNTIME_CONTRACTS
): RuntimeOffer | null => {
    if (typeof value !== 'object' || value === null) return null;
    try {
        const offer = value as Partial<RuntimeOffer>;
        if (offer.sessionOwner !== 'native' || !isContractList(offer.contracts)) return null;
        if (chooseRuntimeContract(contracts, offer.contracts) === null) return null;
        return { sessionOwner: 'native', contracts: [...offer.contracts] };
    } catch {
        return null;
    }
};

export const offerHoldsSession = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) return false;
    try {
        const offer = value as Partial<RuntimeOffer>;
        return offer.sessionOwner === 'native' && offer.held === true;
    } catch {
        return false;
    }
};

export interface SessionSnapshotWire {
    seq: number;
    session: SessionSnapshot;
}

export const SESSION_COMMANDS_TARGET = 'session';

const sessionCommandMethods: {
    [Command in keyof SessionCommands]: CheckedCrossing<SessionCommands[Command], 'call'> extends 'call'
        ? true
        : CheckedCrossing<SessionCommands[Command], 'call'>;
} = {
    loginUser: true,
    loginBySocialToken: true,
    loginGuestByDevice: true,
    loginByOAuthCode: true,
    confirmPhoneLogin: true,
    retryPhoneLogin: true,
    cancelPhoneLogin: true,
    loginWithInviteCode: true,
    forgetInviteLogin: true,
    switchCloud: true,
    switchSite: true,
    clearSiteSelection: true,
    logout: true,
    logoutCloud: true,
    patchRelayUser: true,
    fetchAccountProfile: true,
    updateAccountProfile: true,
    claimPairing: true,
    applyPairingSession: true,
    preparePairedCloudEntry: true,
    checkPairedClouds: true,
    endPairedCloud: true,
};

export const SESSION_COMMAND_METHODS = Object.keys(sessionCommandMethods) as readonly (keyof SessionCommands)[];

type Crossing = 'view' | 'call' | 'stream' | 'local';

const membersCrossing = <T>(members: Record<keyof T, string>, crossing: Crossing): readonly (keyof T)[] =>
    (Object.keys(members) as (keyof T)[]).filter(member => members[member] === crossing);

export const CONNECTION_TARGET = 'connection';

const connectionMembers: { [Member in keyof RuntimeConnection]: CheckedCrossing<RuntimeConnection[Member], Crossing> } =
    {
        snapshot: 'view',
        subscribe: 'view',
        waitUntilVerified: 'call',
        requestOnSlot: 'local',
        onServerEvent: 'stream',
        onServerMessage: 'local',
        observeRequests: 'stream',
        slotStatuses: 'call',
        reconnect: 'call',
        recoverUnverified: 'call',
        recoverOnResume: 'call',
        setBackgroundClouds: 'call',
        setOwnedClouds: 'call',
    };

export const CONNECTION_CALL_METHODS = membersCrossing<RuntimeConnection>(connectionMembers, 'call');
export const CONNECTION_STREAMS = membersCrossing<RuntimeConnection>(connectionMembers, 'stream');
export const CONNECTION_LOCAL_MEMBERS = membersCrossing<RuntimeConnection>(connectionMembers, 'local');

export const SYNC_TARGET = 'sync';

const syncMembers: { [Member in keyof RuntimeSync]: CheckedCrossing<RuntimeSync[Member], Crossing> } = {
    registerTarget: 'stream',
    updateLocalSnapshot: 'call',
    listTargets: 'call',
    refreshBackgroundClouds: 'call',
    onBackgroundDelta: 'stream',
    isChannelRefused: 'view',
    subscribeRefusedChannels: 'view',
    fetchRoomFeed: 'call',
    prefetchRoomFeed: 'call',
    refusedChannels: 'view',
    primeChatRoom: 'call',
};

export const SYNC_CALL_METHODS = membersCrossing<RuntimeSync>(syncMembers, 'call');
export const SYNC_STREAMS = membersCrossing<RuntimeSync>(syncMembers, 'stream');

export const VIEW_STREAMS = {
    [CONNECTION_TARGET]: 'snapshot',
    [SYNC_TARGET]: 'refusedChannels',
} as const;

export const SESSION_CHANGE_SIGNAL = 'session';
export const SESSION_LOGOUT_SIGNAL = 'logout';

export interface RuntimeHelloHost {
    contracts: readonly number[];
    owns: boolean;
    session(): SessionSnapshotWire;
}

export const answerRuntimeHello = (request: RuntimeHelloPayload, host: RuntimeHelloHost): OnRuntimeHelloPayload => {
    const contract = isContractList(request?.contracts)
        ? chooseRuntimeContract(request.contracts, host.contracts)
        : null;
    if (!host.owns || contract === null) return { sessionOwner: 'web' };
    const { seq, session } = host.session();
    return { sessionOwner: 'native', contract, seq, session: session as unknown as RuntimeWireValue };
};

export type RuntimeHelloOutcome = { answer: OnRuntimeHelloPayload } | { failure: { code: string } };

export type RuntimeSettlement =
    | { sessionOwner: 'web' }
    | Extract<OnRuntimeHelloPayload, { sessionOwner: 'native' }>
    | { sessionOwner: null };

export const settleRuntimeHello = (
    outcome: RuntimeHelloOutcome,
    contracts: readonly number[] = RUNTIME_CONTRACTS
): RuntimeSettlement => {
    if ('failure' in outcome) {
        return outcome.failure?.code === 'NOT_FOUND' ? { sessionOwner: 'web' } : { sessionOwner: null };
    }
    const answer: Record<string, unknown> = (outcome.answer as Record<string, unknown> | null | undefined) ?? {};
    const owner = answer.sessionOwner;
    if (owner === 'web') return { sessionOwner: 'web' };
    if (owner !== 'native') return { sessionOwner: null };
    const { contract, seq, session } = answer;
    if (typeof contract !== 'number' || !contracts.includes(contract)) return { sessionOwner: null };
    if (typeof seq !== 'number' || !Number.isInteger(seq) || session === undefined) return { sessionOwner: null };
    return { sessionOwner: 'native', contract, seq, session: session as RuntimeWireValue };
};
