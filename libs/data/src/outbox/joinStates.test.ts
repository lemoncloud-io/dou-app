import type { DataRepositories } from '../repositories';
import { joinNickState, joinNotifyState, joinReadState } from './joinStates';

const graph = () => {
    const join = {
        sendRead: jest.fn().mockResolvedValue({ id: 'ch-1@me', chatNo: 9 }),
        sendJoinUpdate: jest.fn().mockResolvedValue({ id: 'ch-1@me', notify: 'none' }),
        writeMyJoinLocally: jest.fn().mockResolvedValue(undefined),
        cacheWrite: jest.fn().mockResolvedValue(undefined),
    };
    return { join, repositories: { join } as unknown as DataRepositories };
};

const write = <V>(op: 'join.read' | 'join.notify' | 'join.nick', value: V) => ({
    op,
    cid: 'cloud-a',
    uid: 'me',
    key: 'ch-1',
    value,
});

describe('join states', () => {
    describe('join.read', () => {
        it('keeps the higher cursor and treats a lower one as already there', () => {
            expect(joinReadState.merge?.(10, 7)).toBe(10);
            expect(joinReadState.merge?.(7, 10)).toBe(10);
            expect(joinReadState.isCovered?.(10, 9)).toBe(true);
            expect(joinReadState.isCovered?.(10, 11)).toBe(false);
        });

        it('delivers through sendRead and records the answer', async () => {
            const { join, repositories } = graph();
            const answer = await joinReadState.deliver(repositories, write('join.read', 9));
            await joinReadState.accept?.(repositories, write('join.read', 9), answer);

            expect(join.sendRead).toHaveBeenCalledWith({ channelId: 'ch-1', chatNo: 9 });
            expect(join.cacheWrite).toHaveBeenCalledWith({ id: 'ch-1@me', chatNo: 9 });
        });

        it('has nothing to restore — the cursor never moves backwards', () => {
            expect(joinReadState.restore).toBeUndefined();
        });
    });

    describe.each([
        ['join.notify', joinNotifyState, 'none', { notify: 'none' }, { notify: 'all' }],
        ['join.nick', joinNickState, 'New', { nick: 'New' }, { nick: 'Old' }],
    ] as const)('%s', (op, state, value, sent, restored) => {
        it('lets the latest value win and treats the same value as already there', () => {
            expect(state.merge).toBeUndefined();
            expect((state.isCovered as (a: unknown, b: unknown) => boolean)(value, value)).toBe(true);
            expect((state.isCovered as (a: unknown, b: unknown) => boolean)(value, 'other')).toBe(false);
        });

        it('delivers only its own field through sendJoinUpdate and records the answer', async () => {
            const { join, repositories } = graph();
            const deliver = state.deliver as (r: DataRepositories, w: unknown) => Promise<unknown>;
            const answer = await deliver(repositories, write(op, value));
            await state.accept?.(repositories, write(op, value) as never, answer);

            expect(join.sendJoinUpdate).toHaveBeenCalledWith('ch-1', sent);
            expect(join.cacheWrite).toHaveBeenCalledWith(answer);
        });

        it('puts the restored value back locally only', async () => {
            const { join, repositories } = graph();
            const restore = state.restore as (r: DataRepositories, w: unknown, v: unknown) => Promise<void>;
            await restore(repositories, write(op, value), Object.values(restored)[0]);

            expect(join.writeMyJoinLocally).toHaveBeenCalledWith('ch-1', restored);
            expect(join.sendJoinUpdate).not.toHaveBeenCalled();
        });
    });
});
