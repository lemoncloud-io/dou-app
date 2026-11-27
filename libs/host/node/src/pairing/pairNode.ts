import { createPairingRequestFlow, readSessionDeviceId, sessionCommands } from '@chatic/runtime/api';
import { pairingClientOf } from '@chatic/runtime/api/session';
import type { PairingRequestScreen, PairingRequestState } from '@chatic/runtime/api';
import { getRepositories } from '@chatic/runtime/engine';

export const PAIRING_ENDED_PHASES = ['done', 'denied', 'expired', 'lost', 'failed'] as const;

export type PairingEndedPhase = (typeof PAIRING_ENDED_PHASES)[number];
export type PairingEnded = Extract<PairingRequestState, { phase: PairingEndedPhase }>;

export interface PairNodeOptions {
    deviceId?: string;
    request?: PairingRequestScreen['request'];
    writeLine?: (line: string) => void;
    onChange?: (state: PairingRequestState) => void;
    signal?: AbortSignal;
}

const isEnded = (state: PairingRequestState): state is PairingEnded =>
    (PAIRING_ENDED_PHASES as readonly string[]).includes(state.phase);

export const pairNode = (options: PairNodeOptions = {}): Promise<PairingEnded> => {
    const { writeLine = () => undefined, onChange, signal } = options;
    const deviceId = options.deviceId ?? readSessionDeviceId();
    const request =
        options.request ??
        (async () => {
            await sessionCommands().loginGuestByDevice(deviceId);
            return getRepositories().pairing.requestPairing({
                purpose: 'web',
                deviceId,
                client: pairingClientOf(),
            });
        });

    return new Promise<PairingEnded>((resolve, reject) => {
        const finish = (settle: () => void): void => {
            flow.stop();
            signal?.removeEventListener('abort', aborted);
            settle();
        };
        const aborted = (): void => finish(() => reject(new Error('pairing aborted')));
        const flow = createPairingRequestFlow({
            request,
            switchCloud: cloudId => sessionCommands().switchCloud(cloudId),
            onChange: state => {
                if (state.phase === 'waiting') writeLine(`pairing code: ${state.code}`);
                onChange?.(state);
                if (isEnded(state)) finish(() => resolve(state));
            },
        });
        if (signal?.aborted) return aborted();
        signal?.addEventListener('abort', aborted, { once: true });
        flow.start();
    });
};
