import { cloudStatusWord } from './cloudStatusWord';

describe('cloudStatusWord — the status row on the cloud information screen', () => {
    it('reads a live cloud as subscribed', () => {
        expect(cloudStatusWord({ status: 'active' })).toEqual({ key: 'subscribed', tone: 'info' });
    });

    it('tells a lapsed-subscription hold from a downgrade hold — the fixes differ', () => {
        expect(cloudStatusWord({ status: 'suspended', state$: { hold: 'expired' } })).toEqual({
            key: 'expired',
            tone: 'danger',
        });
        expect(cloudStatusWord({ status: 'suspended', state$: { hold: 'downgrade' } })).toEqual({
            key: 'restricted',
            tone: 'danger',
        });
    });

    it('words the other states the way the list badges do', () => {
        expect(cloudStatusWord({ status: 'reserved' })).toEqual({ key: 'provisioning', tone: 'info' });
        expect(cloudStatusWord({ status: 'error' })).toEqual({ key: 'setupFailed', tone: 'danger' });
        expect(cloudStatusWord({ status: 'active', state$: { plan: 'drop' } })).toEqual({
            key: 'ending',
            tone: 'warning',
        });
    });

    it('reads a released cloud as expired', () => {
        expect(cloudStatusWord({ status: 'expired' })).toEqual({ key: 'expired', tone: 'danger' });
    });
});
