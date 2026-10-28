import { resolveDeepLink } from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

// Same workaround as deeplinkUtils.test.ts: the barrel reaches web-only modules the CommonJS
// transform cannot parse, so the specifier points at the decoder module itself.
jest.mock('@chatic/shared', () => jest.requireActual('../../../../../../libs/shared/src/utils/inviteLink'));

const id = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';

// The URL the iOS Share Extension opens and the Android share intent is rewritten to. It has to
// reach the web as its share page, through the same pipeline every other link takes.
describe('resolveDeepLink — share intake URL', () => {
    it.each(['chatic', 'chatic-dev'])('turns %s://share?id= into the web share page', scheme => {
        expect(resolveDeepLink(`${scheme}://share?id=${id}`)).toEqual({ kind: 'web', path: `/share?id=${id}` });
    });

    it('keeps the id as given, without re-encoding it', () => {
        const result = resolveDeepLink(`chatic://share?id=${id}`);

        expect(result.kind === 'web' && new URLSearchParams(result.path.split('?')[1]).get('id')).toBe(id);
    });
});
