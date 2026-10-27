import { classifyPairingError } from './pairingErrors';

const fail = (status: number, data = '') =>
    Object.assign(new Error(`status ${status}`), { response: { status, data } });

describe('classifyPairingError', () => {
    it.each([
        ['check', fail(404), 'notFound'],
        ['check', fail(400, '400 BAD REQUEST - pairing expired @pairing(p-1)'), 'expired'],
        ['approve', fail(400, '400 BAD REQUEST - pairing expired'), 'expired'],
        ['check', fail(403), 'codeRefused'],
        ['approve', fail(403), 'targetRefused'],
        ['approve', fail(409), 'alreadyHandled'],
        ['deny', fail(409), 'alreadyHandled'],
        ['check', fail(400, '400 BAD REQUEST - code is invalid'), 'unknown'],
        ['approve', new Error('Network Error'), 'unknown'],
    ] as const)('%s %j → %s', (operation, error, expected) => {
        expect(classifyPairingError(operation, error)).toBe(expected);
    });
});
