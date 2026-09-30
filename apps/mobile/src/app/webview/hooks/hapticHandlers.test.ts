import type { IHapticBridge } from '../../bridge';
import { createHapticHandlers } from './hapticHandlers';

const createHapticMock = (): jest.Mocked<IHapticBridge> => ({ trigger: jest.fn().mockReturnValue(true) });

describe('createHapticHandlers', () => {
    it('plays the requested kind and answers OnTriggerHaptic', async () => {
        const haptic = createHapticMock();
        const { handleTriggerHaptic } = createHapticHandlers(haptic);

        const res = await handleTriggerHaptic({
            type: 'TriggerHaptic',
            refId: 'r1',
            data: { kind: 'selection' },
        } as any);

        expect(haptic.trigger).toHaveBeenCalledWith('selection');
        expect(res).toEqual({ type: 'OnTriggerHaptic', success: true, data: {} });
    });

    it('still answers success when the native module is missing, since the message itself is handled', async () => {
        const haptic = createHapticMock();
        haptic.trigger.mockReturnValue(false);
        const { handleTriggerHaptic } = createHapticHandlers(haptic);

        const res = await handleTriggerHaptic({ type: 'TriggerHaptic', refId: 'r2', data: { kind: 'impact' } } as any);

        expect(res.success).toBe(true);
    });

    it('refuses a kind this build does not know, without touching the native module', async () => {
        const haptic = createHapticMock();
        const { handleTriggerHaptic } = createHapticHandlers(haptic);

        const res = await handleTriggerHaptic({ type: 'TriggerHaptic', refId: 'r3', data: { kind: 'rumble' } } as any);

        expect(haptic.trigger).not.toHaveBeenCalled();
        expect(res.success).toBe(false);
        expect((res as any).error.code).toBe('INVALID_KIND');
    });

    it('plays a posted haptic without answering it', async () => {
        const haptic = createHapticMock();
        const { handleTriggerHaptic } = createHapticHandlers(haptic);

        const res = await handleTriggerHaptic({ type: 'TriggerHaptic', data: { kind: 'impact' } } as any);

        expect(haptic.trigger).toHaveBeenCalledWith('impact');
        expect(res).toBeUndefined();
    });

    it('drops a posted haptic of an unknown kind silently', async () => {
        const haptic = createHapticMock();
        const { handleTriggerHaptic } = createHapticHandlers(haptic);

        const res = await handleTriggerHaptic({ type: 'TriggerHaptic', data: { kind: 'rumble' } } as any);

        expect(haptic.trigger).not.toHaveBeenCalled();
        expect(res).toBeUndefined();
    });
});
