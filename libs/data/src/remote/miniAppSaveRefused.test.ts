import { MiniAppSaveRefused, miniAppSaveProblemOf, refuseMiniAppSave } from './miniAppSaveRefused';

const relayError = (status: number, data: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

const socketError = (text: string, type = 'miniapp.create:error') => new Error(`${text} - ${type}`);

const refusalOf = (error: unknown): unknown => {
    try {
        refuseMiniAppSave(error);
    } catch (thrown) {
        return thrown;
    }
    throw new Error('refuseMiniAppSave returned');
};

describe('refuseMiniAppSave', () => {
    const scope = 'bodyToModel(miniapp/)';

    describe.each([
        ['nameMissing', `400 INVALID - .name (string) is required - ${scope}`],
        ['nameTooLong', `400 INVALID - .name is too long (max 30) - ${scope}`],
        ['invalidUrl', `400 INVALID - .url[http://shop.example/] is invalid - ${scope}`],
        ['invalidUrl', '400 INVALID - .url (string) is required'],
        ['hubUrl', `400 INVALID - .url[https://x.apps.chatic.io/] is hub - ${scope}`],
        ['tooMany', '409 QUOTA EXCEEDED - max[10] current[10]'],
        ['notAllowed', '403 NOT ALLOWED - action[update] is invalid'],
        ['notAllowed', '403 NOT ALLOWED - action[delete] is invalid'],
    ])('%s — %s', (problem, text) => {
        it('reads it off the socket rejection, with the action appended', () => {
            const original = socketError(text);

            const refused = refusalOf(original);

            expect(refused).toBeInstanceOf(MiniAppSaveRefused);
            expect(refused).toMatchObject({ problem, name: 'MiniAppSaveRefused', code: problem, cause: original });
        });

        it('reads it off an HTTP-shaped error carrying the status apart', () => {
            const status = Number(text.slice(0, 3));

            expect(refusalOf(relayError(status, text))).toMatchObject({ problem });
        });
    });

    it.each([
        ['another verdict', `400 INVALID - .url[a] is hub b] is invalid - ${scope}`],
        ["another rule's words", `400 INVALID - .url[x .name is too long y] is invalid - ${scope}`],
        [
            'a line that looks like a refusal',
            `400 INVALID - .url[x\n400 INVALID - .name is too long] is invalid - ${scope}`,
        ],
    ])('reads the verdict after the address, whatever the address holds — %s', (_label, text) => {
        expect(refusalOf(socketError(text))).toMatchObject({ problem: 'invalidUrl' });
    });

    it.each([
        ['a connection before sign-in', socketError('403 NOT ALLOWED - denied by policy', 'miniapp.update:error')],
        ['no place chosen yet', socketError('403 IDENTITY-TOKEN - site is required', 'miniapp.list:error')],
        ['hold in the body', socketError('403 FORBIDDEN - hold is only for admin')],
        ['an HTTP 403 for someone else', relayError(403, '403 FORBIDDEN - not owner of cloud')],
        ['no mini app', socketError('404 NOT FOUND - miniapp', 'miniapp.delete:error')],
        ['signed out', socketError('401 UNAUTHORIZED - auth expired')],
        ['a 409 that is not the cap', socketError('409 CONFLICT - something else')],
        ['no socket', new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()')],
        ['an action the server lacks', socketError('socket request failed', 'miniapp.list:error')],
        ['the network', Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })],
    ])('rethrows %s unchanged', (_label, error) => {
        expect(refusalOf(error)).toBe(error);
    });
});

describe('miniAppSaveProblemOf', () => {
    it('reads the reason off the error itself', () => {
        expect(miniAppSaveProblemOf(new MiniAppSaveRefused('hubUrl'))).toBe('hubUrl');
        expect(miniAppSaveProblemOf(new MiniAppSaveRefused('notAllowed'))).toBe('notAllowed');
    });

    it('reads the reason off an error that crossed the bridge', () => {
        const crossed = (code: string) =>
            Object.assign(new Error('save refused'), { name: 'MiniAppSaveRefused', code });

        expect(miniAppSaveProblemOf(crossed('tooMany'))).toBe('tooMany');
        expect(miniAppSaveProblemOf(crossed('notAllowed'))).toBe('notAllowed');
    });

    it('is null for any other error, or an unknown code', () => {
        expect(miniAppSaveProblemOf(Object.assign(new Error('x'), { code: 'tooMany' }))).toBeNull();
        expect(
            miniAppSaveProblemOf(Object.assign(new Error('x'), { name: 'MiniAppSaveRefused', code: 'other' }))
        ).toBeNull();
        expect(miniAppSaveProblemOf(null)).toBeNull();
        expect(miniAppSaveProblemOf('nameMissing')).toBeNull();
    });
});
