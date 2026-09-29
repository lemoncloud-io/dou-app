import { isChatPush } from './isChatPush';

describe('isChatPush', () => {
    it('passes a chat push', () => {
        expect(isChatPush({ type: 'chat', cid: 'cloud_2' })).toBe(true);
    });

    it('passes a push that carries no type at all', () => {
        expect(isChatPush({ cid: 'cloud_2' })).toBe(true);
        expect(isChatPush({ type: '  ', cid: 'cloud_2' })).toBe(true);
    });

    it('blocks a cloud-activation push, which names a cloud that has nothing unread', () => {
        expect(isChatPush({ type: 'cloud', cid: 'cloud_new' })).toBe(false);
    });

    it('blocks a type it has never heard of', () => {
        expect(isChatPush({ type: 'marketing' })).toBe(false);
    });
});
