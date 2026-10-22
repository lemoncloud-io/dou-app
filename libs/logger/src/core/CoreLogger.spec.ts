import { CoreLogger } from './CoreLogger';
import { LogHub } from './LogHub';

import type { LogEntry } from './types';

const build = () => {
    const hub = new LogHub();
    const seen: LogEntry[] = [];
    hub.subscribe(entry => seen.push(entry));
    return { logger: new CoreLogger({ hub }), seen };
};

describe('CoreLogger — httpStatus and errorCode', () => {
    it('lifts httpStatus and errorCode from the options shape onto the entry', () => {
        const { logger, seen } = build();

        logger.error('net.request_failed', 'request failed', {
            error: new Error('x'),
            httpStatus: 401,
            errorCode: 'E1',
        });

        expect(seen[0]).toMatchObject({ httpStatus: 401, errorCode: 'E1' });
        expect(seen[0].data).toBeUndefined();
    });

    it('keeps a bare payload that only has errorCode as data, as before', () => {
        const { logger, seen } = build();

        logger.warn('SOCKET', 'closed', { errorCode: 4001 });

        expect(seen[0].data).toEqual({ errorCode: 4001 });
        expect(seen[0]).not.toHaveProperty('errorCode');
    });

    it('drops an httpStatus that is not an HTTP status and stringifies a numeric errorCode', () => {
        const { logger, seen } = build();

        logger.error('NET', 'failed', { error: 'x', httpStatus: 0, errorCode: 409 as unknown as string });

        expect(seen[0]).not.toHaveProperty('httpStatus');
        expect(seen[0].errorCode).toBe('409');
    });

    it('adds no keys to an entry that never had them', () => {
        const { logger, seen } = build();

        logger.info('APP', 'hello');

        expect(seen[0]).not.toHaveProperty('httpStatus');
        expect(seen[0]).not.toHaveProperty('errorCode');
        expect(seen[0]).not.toHaveProperty('kind');
    });
});
