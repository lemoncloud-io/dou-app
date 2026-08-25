import { getLogQueueView, registerLogQueueView } from './logQueueView';

import type { LogEntry } from '@chatic/bridges';

const entry = (message: string): LogEntry => ({
    id: message,
    level: 'info',
    tag: 'T',
    message,
    timestamp: 1,
});

const viewOf = (entries: LogEntry[]) => ({
    snapshot: () => entries,
    clear: jest.fn(),
});

describe('logQueueView', () => {
    it('등록 전에는 없다 — 빈 배열이 아니라 undefined여야 한다', () => {
        // A monitor that gets `[]` cannot tell "no uploader running" from "no
        // logs yet", and would render the first as the second.
        expect(getLogQueueView()).toBeUndefined();
    });

    it('등록하면 그 뷰를 돌려준다', () => {
        const view = viewOf([entry('a')]);
        const unregister = registerLogQueueView(view);

        expect(
            getLogQueueView()
                ?.snapshot()
                .map(e => e.message)
        ).toEqual(['a']);

        unregister();
    });

    it('해제하면 다시 없어진다 — teardown 후 유령 큐를 읽지 않는다', () => {
        const unregister = registerLogQueueView(viewOf([entry('a')]));

        unregister();

        expect(getLogQueueView()).toBeUndefined();
    });

    it('늦게 도착한 해제가 새 등록을 지우지 않는다', () => {
        // Two uploaders overlap when a reload re-runs boot before the previous
        // teardown lands. An unguarded unregister would leave the live uploader's
        // queue invisible for the rest of the session.
        const unregisterOld = registerLogQueueView(viewOf([entry('old')]));
        registerLogQueueView(viewOf([entry('new')]));

        unregisterOld();

        expect(
            getLogQueueView()
                ?.snapshot()
                .map(e => e.message)
        ).toEqual(['new']);
    });
});
