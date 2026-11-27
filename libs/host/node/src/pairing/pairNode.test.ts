import { initAppRuntime, resetRuntimeEngine } from '@chatic/runtime/api';
import type { PairingRequestState } from '@chatic/runtime/api';
import type { RuntimeEngine } from '@chatic/runtime/engine';

import { pairNode } from './pairNode';

type Approval =
    | { status: 'pending' | 'denied' | 'expired' }
    | { status: 'approved'; target: { type: 'relay' | 'cloud'; cloudId?: string }; session?: unknown };

class FakeRelay {
    guest = false;
    relaySessionApplied = false;
    approvedCloud: string | null = null;
    entered: string[] = [];
    claims = 0;
    appliedHandles: string[] = [];

    constructor(private readonly answers: Approval[]) {}

    request = async () => ({ pairingId: 'p1', code: 'ABC-123', expiredAt: Date.now() + 60_000, interval: 0 });

    commands = {
        loginGuestByDevice: async () => {
            this.guest = true;
        },
        claimPairing: async () => {
            const answer = this.answers[Math.min(this.claims++, this.answers.length - 1)];
            if (answer.status !== 'approved') return answer;
            if (answer.target.type === 'cloud') {
                this.approvedCloud = answer.target.cloudId ?? null;
                return { status: 'approved', target: answer.target, approver: { name: 'me' } };
            }
            return { status: 'approved', target: answer.target, approver: { name: 'me' }, sessionHandle: 'handle-1' };
        },
        applyPairingSession: async (handle: string) => {
            this.appliedHandles.push(handle);
            this.relaySessionApplied = true;
        },
        preparePairedCloudEntry: async (cloudId: string) => {
            if (!this.guest || this.approvedCloud !== cloudId) {
                throw Object.assign(new Error(`NOT ALLOWED - cloud[${cloudId}] is not approved`), { status: 403 });
            }
        },
        switchCloud: async (cloudId: string) => {
            this.entered.push(cloudId);
        },
    };
}

const install = (relay: FakeRelay): void => {
    initAppRuntime({ commands: relay.commands, session: { snapshot: () => ({}) } } as unknown as RuntimeEngine);
};

const run = (relay: FakeRelay) => {
    const lines: string[] = [];
    const phases: PairingRequestState['phase'][] = [];
    const ended = pairNode({
        deviceId: 'dev-1',
        request: async () => {
            await relay.commands.loginGuestByDevice();
            return relay.request();
        },
        writeLine: line => lines.push(line),
        onChange: state => phases.push(state.phase),
    });
    return { ended, lines, phases };
};

describe('pairNode', () => {
    afterEach(() => resetRuntimeEngine());

    it('relay approval applies the claimed session and ends done', async () => {
        const relay = new FakeRelay([{ status: 'pending' }, { status: 'approved', target: { type: 'relay' } }]);
        install(relay);
        const { ended, lines, phases } = run(relay);

        await expect(ended).resolves.toMatchObject({ phase: 'done', target: { type: 'relay' } });
        expect(lines).toEqual(['pairing code: ABC-123']);
        expect(phases).toEqual(['requesting', 'waiting', 'applying', 'done']);
        expect(relay.appliedHandles).toEqual(['handle-1']);
        expect(relay.entered).toEqual([]);
    });

    it('cloud approval enters the cloud through the guest session and ends done', async () => {
        const relay = new FakeRelay([{ status: 'approved', target: { type: 'cloud', cloudId: 'cloud-9' } }]);
        install(relay);
        const { ended } = run(relay);

        await expect(ended).resolves.toMatchObject({ phase: 'done', target: { type: 'cloud', cloudId: 'cloud-9' } });
        expect(relay.entered).toEqual(['cloud-9']);
        expect(relay.appliedHandles).toEqual([]);
    });

    it('cloud approval without the guest session is lost, as the Rust engine saw', async () => {
        const relay = new FakeRelay([{ status: 'approved', target: { type: 'cloud', cloudId: 'cloud-9' } }]);
        install(relay);
        const ended = pairNode({ deviceId: 'dev-1', request: relay.request });

        await expect(ended).resolves.toMatchObject({ phase: 'lost' });
        expect(relay.entered).toEqual([]);
    });

    it.each([
        ['denied', 'denied'],
        ['expired', 'expired'],
    ] as const)('%s ends %s without applying a session', async (status, phase) => {
        const relay = new FakeRelay([{ status }]);
        install(relay);
        const { ended } = run(relay);

        await expect(ended).resolves.toMatchObject({ phase });
        expect(relay.appliedHandles).toEqual([]);
        expect(relay.entered).toEqual([]);
    });

    it('an aborted run rejects and stops claiming', async () => {
        const relay = new FakeRelay([{ status: 'pending' }]);
        install(relay);
        const controller = new AbortController();
        const ended = pairNode({ deviceId: 'dev-1', request: relay.request, signal: controller.signal });
        controller.abort();

        await expect(ended).rejects.toThrow('pairing aborted');
    });
});
