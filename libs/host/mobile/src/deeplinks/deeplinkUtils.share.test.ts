import { resolveDeepLink } from './deeplinkUtils';

jest.mock('react-native-config', () => ({
    default: { VITE_ENV: 'DEV' },
}));

jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('../../../../shared/src/utils/inviteLink'),
    ...jest.requireActual('../../../../shared/src/utils/subWebViewLink'),
}));

const id = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';

describe('resolveDeepLink — share intake URL', () => {
    it.each(['chatic', 'chatic-dev'])('turns %s://share?id= into the web share page', scheme => {
        expect(resolveDeepLink(`${scheme}://share?id=${id}`)).toEqual({ kind: 'web', path: `/share?id=${id}` });
    });

    it('keeps the id as given, without re-encoding it', () => {
        const result = resolveDeepLink(`chatic://share?id=${id}`);

        expect(result.kind === 'web' && new URLSearchParams(result.path.split('?')[1]).get('id')).toBe(id);
    });
});
