import { act, renderHook } from '@testing-library/react';

import { usePairingApproval } from './usePairingApproval';

const checkPairing = jest.fn();
const approvePairing = jest.fn();
const denyPairing = jest.fn();
const classify = jest.fn((_op: string, _e: unknown) => 'notFound');

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ pairing: { checkPairing, approvePairing, denyPairing } }) },
        session: { classifyPairingError: (op: string, e: unknown) => classify(op, e) },
    },
}));

const CHECK = { pairingId: 'p-1', purpose: 'web', deviceId: 'd-1', client: { name: 'Chrome · macOS' }, expiredAt: 1 };

beforeEach(() => {
    jest.clearAllMocks();
    checkPairing.mockResolvedValue(CHECK);
    approvePairing.mockResolvedValue({ pairingId: 'p-1', status: 'approved' });
    denyPairing.mockResolvedValue({ pairingId: 'p-1', status: 'denied' });
});

const type = async (result: { current: ReturnType<typeof usePairingApproval> }, text: string) => {
    await act(async () => {
        result.current.setCode(text);
    });
};

describe('usePairingApproval', () => {
    it('keeps digits only and looks the code up once it has eight', async () => {
        const { result } = renderHook(() => usePairingApproval());

        await type(result, '0734-41');
        expect(result.current.code).toBe('073441');
        expect(checkPairing).not.toHaveBeenCalled();

        await type(result, ' 0734-4168 99');
        expect(result.current.code).toBe('07344168');
        expect(checkPairing).toHaveBeenCalledWith('07344168');
        expect(result.current.state).toEqual({ step: 'confirm', check: CHECK });
    });

    it('does not look the same code up twice', async () => {
        checkPairing.mockRejectedValueOnce(new Error('404'));
        const { result } = renderHook(() => usePairingApproval());

        await type(result, '07344168');
        await type(result, '0734-4168');

        expect(checkPairing).toHaveBeenCalledTimes(1);
        expect(result.current.error).toBe('notFound');
    });

    it('looks again after the code was edited', async () => {
        checkPairing.mockRejectedValueOnce(new Error('404'));
        const { result } = renderHook(() => usePairingApproval());

        await type(result, '07344168');
        await type(result, '0734416');
        await type(result, '07344168');

        expect(checkPairing).toHaveBeenCalledTimes(2);
    });

    it('approves for the chosen target', async () => {
        const { result } = renderHook(() => usePairingApproval());
        await type(result, '07344168');

        await act(async () => {
            await result.current.approve({ type: 'cloud', cloudId: '1000002' });
        });

        expect(approvePairing).toHaveBeenCalledWith('p-1', { type: 'cloud', cloudId: '1000002' });
        expect(result.current.state).toEqual({ step: 'approved' });
    });

    it('stays on the confirm step with the approve error', async () => {
        approvePairing.mockRejectedValueOnce(new Error('409'));
        classify.mockReturnValueOnce('alreadyHandled');
        const { result } = renderHook(() => usePairingApproval());
        await type(result, '07344168');

        await act(async () => {
            await result.current.approve({ type: 'relay' });
        });

        expect(classify).toHaveBeenLastCalledWith('approve', expect.any(Error));
        expect(result.current.error).toBe('alreadyHandled');
        expect(result.current.state).toEqual({ step: 'confirm', check: CHECK });
    });

    it('declines', async () => {
        const { result } = renderHook(() => usePairingApproval());
        await type(result, '07344168');

        await act(async () => {
            await result.current.deny();
        });

        expect(denyPairing).toHaveBeenCalledWith('p-1');
        expect(result.current.state).toEqual({ step: 'denied' });
    });

    it('looks the same code up again on retry', async () => {
        checkPairing.mockRejectedValueOnce(new Error('Network Error'));
        classify.mockReturnValueOnce('unknown');
        const { result } = renderHook(() => usePairingApproval());
        await type(result, '07344168');

        await act(async () => {
            result.current.retry();
        });

        expect(checkPairing).toHaveBeenCalledTimes(2);
        expect(result.current.state).toEqual({ step: 'confirm', check: CHECK });
    });
});
