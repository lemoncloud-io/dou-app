import { createPlaceListEmptyReporter } from './placeListEmptyReporter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@chatic/bridges';

const info = logger.info as jest.Mock;
const entries = () => info.mock.calls.map(call => call[2]);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('placeListEmptyReporter', () => {
    it('records a scope going empty on the second empty answer in a row, and only then', () => {
        const reporter = createPlaceListEmptyReporter();

        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        expect(info).not.toHaveBeenCalled();
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);

        expect(info).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledWith('PLACE', expect.stringContaining('no place'), {
            observation: 'place-list-empty',
            cid: 'c1',
            deletedRows: 0,
            emptyAnswers: 2,
        });
    });

    it('records the end of a reported run with how many empty answers it lasted', () => {
        const reporter = createPlaceListEmptyReporter();
        reporter.empty({ cid: 'c1', uid: 'u1' }, 2);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 2);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 2);
        info.mockClear();

        reporter.filled({ cid: 'c1', uid: 'u1' });

        expect(entries()).toEqual([{ observation: 'place-list-empty', cid: 'c1', afterEmptyAnswers: 3 }]);
    });

    it('says nothing about a single empty answer that the next one corrects — a switch not ready yet', () => {
        const reporter = createPlaceListEmptyReporter();

        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.filled({ cid: 'c1', uid: 'u1' });
        // The run was cleared, so the next single empty answer starts from one again.
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);

        expect(info).not.toHaveBeenCalled();
    });

    it('stays silent for a list that has places and was never empty', () => {
        const reporter = createPlaceListEmptyReporter();

        reporter.filled({ cid: 'c1', uid: 'u1' });
        reporter.filled({ cid: 'c1', uid: 'u1' });

        expect(info).not.toHaveBeenCalled();
    });

    it('records a scope going empty again after it had a place in between', () => {
        const reporter = createPlaceListEmptyReporter();
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.filled({ cid: 'c1', uid: 'u1' });
        info.mockClear();

        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);

        expect(entries()).toEqual([expect.objectContaining({ cid: 'c1', emptyAnswers: 2 })]);
    });

    it('keeps clouds and accounts apart', () => {
        const reporter = createPlaceListEmptyReporter();
        const twice = (cid: string, uid: string) => {
            reporter.empty({ cid, uid }, 0);
            reporter.empty({ cid, uid }, 0);
        };

        twice('c1', 'u1');
        twice('c2', 'u1');
        twice('c1', 'u2');
        // A place in one cloud ends no other cloud's run.
        reporter.filled({ cid: 'c2', uid: 'u1' });
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);

        expect(entries()).toEqual([
            expect.objectContaining({ cid: 'c1', emptyAnswers: 2 }),
            expect.objectContaining({ cid: 'c2', emptyAnswers: 2 }),
            expect.objectContaining({ cid: 'c1', emptyAnswers: 2 }),
            expect.objectContaining({ cid: 'c2', afterEmptyAnswers: 2 }),
        ]);
    });

    it('counts nothing while the account is not known, so no run is left that nothing can end', () => {
        const reporter = createPlaceListEmptyReporter();

        reporter.empty({ cid: 'c1' }, 0);
        reporter.empty({ cid: 'c1' }, 0);
        reporter.filled({ cid: 'c1' });
        // Once the account is known, its own run is counted from the start.
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);

        expect(entries()).toEqual([expect.objectContaining({ cid: 'c1', emptyAnswers: 2 })]);
    });

    it('forgets every scope on reset', () => {
        const reporter = createPlaceListEmptyReporter();
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);
        reporter.reset();
        info.mockClear();

        reporter.filled({ cid: 'c1', uid: 'u1' });
        reporter.empty({ cid: 'c1', uid: 'u1' }, 0);

        expect(info).not.toHaveBeenCalled();
    });
});
