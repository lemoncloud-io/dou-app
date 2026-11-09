import { isGoneFailure, readRevisedTargets, revisedIdsOf } from './revisionNotices';

describe('revisionNotices', () => {
    it('collects the messages revision notices point at, once each, and nothing else', () => {
        expect(
            revisedIdsOf([
                { subType: 'edit', edit$: { action: 'update', chatId: 'C1:4' } },
                { subType: 'edit', edit$: { action: 'delete', chatId: 'C1:4' } },
                { subType: 'edit', edit$: { action: 'update', chatId: 'C1:6' } },
                { subType: 'reaction' },
                { subType: 'edit' },
            ] as never)
        ).toEqual(['C1:4', 'C1:6']);
    });

    it('reads every target, keeping rows with an id and the reads that threw', async () => {
        const result = await readRevisedTargets(['a', 'b', 'c'], async id => {
            if (id === 'b') throw new Error('500 timeout');
            return id === 'a' ? { id: 'a' } : {};
        });

        expect(result.changed).toEqual([{ id: 'a' }]);
        expect(result.failed.map(failure => failure.id)).toEqual(['b']);
    });

    // A message the reader can no longer see will never read; anything else may next time.
    it('treats a 403 or 404 as gone and anything else as passing trouble', () => {
        expect(isGoneFailure(new Error('404 NOT FOUND - chat/C1:4'))).toBe(true);
        expect(isGoneFailure('403 FORBIDDEN')).toBe(true);
        expect(isGoneFailure(new Error('500 timeout'))).toBe(false);
        expect(isGoneFailure(new Error('network down'))).toBe(false);
    });
});
