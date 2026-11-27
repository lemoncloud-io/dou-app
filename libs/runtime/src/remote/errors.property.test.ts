import * as fc from 'fast-check';

import { reviveRuntimeError, serializeRuntimeError, toRuntimeFailure } from './errors';

const RUNS = { numRuns: 200, seed: 1123 };

const status = fc.integer({ min: 100, max: 599 });

const failureFields = fc.record(
    {
        name: fc.constantFrom('Error', 'TypeError', 'AxiosError', 'SocketError'),
        message: fc.string(),
        code: fc.oneof(fc.string({ maxLength: 12 }), fc.integer({ min: -1, max: 9999 })),
        errorCode: fc.integer({ min: 0, max: 99999 }),
        status,
        statusCode: status,
        response: fc.record({ status, data: fc.jsonValue({ maxDepth: 3 }) }, { requiredKeys: [] }),
    },
    { requiredKeys: ['message'] }
);

const thrownWith = fc.tuple(failureFields, fc.boolean()).map(([fields, asError]) => ({
    fields,
    error: asError ? Object.assign(new Error(fields.message), fields) : ({ ...fields } as Record<string, unknown>),
}));

const thrown = thrownWith.map(({ error }) => error);

const acrossTheBridge = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('runtime error crossing properties', () => {
    it('an error revived on the other side of the bridge carries every field it was thrown with', () => {
        fc.assert(
            fc.property(thrownWith, ({ fields, error }) => {
                const revived = reviveRuntimeError(acrossTheBridge(toRuntimeFailure(error)));

                expect(revived).toBeInstanceOf(Error);
                expect(revived.message).toBe(fields.message);
                expect({ ...revived }).toEqual(
                    acrossTheBridge({
                        name: fields.name ?? 'Error',
                        code: fields.code,
                        errorCode: fields.errorCode,
                        status: fields.status,
                        statusCode: fields.statusCode,
                        response: fields.response,
                    })
                );
            }),
            RUNS
        );
    });

    it('serializing an already serialized error changes nothing', () => {
        fc.assert(
            fc.property(fc.oneof(thrown, fc.anything()), value => {
                const once = serializeRuntimeError(value);

                expect(serializeRuntimeError(once)).toEqual(once);
            }),
            RUNS
        );
    });
});
