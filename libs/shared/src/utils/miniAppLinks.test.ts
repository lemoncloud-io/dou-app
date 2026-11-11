import { checkMiniAppLink, MINI_APP_LINK_LIMIT, MINI_APP_LINK_NAME_MAX, parseMiniAppLinks } from './miniAppLinks';

describe('checkMiniAppLink', () => {
    it('accepts a named https page', () => {
        expect(checkMiniAppLink(' Carrot ', ' https://carrot.example/#download ')).toBeNull();
    });

    it('asks for a name', () => {
        expect(checkMiniAppLink('   ', 'https://carrot.example/')).toBe('nameMissing');
    });

    it('counts the name on characters, so an emoji counts once', () => {
        expect(checkMiniAppLink('🥕'.repeat(MINI_APP_LINK_NAME_MAX), 'https://carrot.example/')).toBeNull();
        expect(checkMiniAppLink('a'.repeat(MINI_APP_LINK_NAME_MAX + 1), 'https://carrot.example/')).toBe('nameTooLong');
    });

    it.each([['http://carrot.example/'], ['https://carrot.example:8443/'], ['https://user@carrot.example/'], ['']])(
        'refuses %j, which the shell would not open',
        url => {
            expect(checkMiniAppLink('Carrot', url)).toBe('invalidUrl');
        }
    );

    it.each([['https://apps.chatic.io/'], ['https://apps.chatic.io/other'], ['https://APPS-DEV.chatic.io/x?y=1']])(
        'refuses the hub host %j, whose page would be told the owner and the list',
        url => {
            expect(checkMiniAppLink('Hub', url)).toBe('hubUrl');
        }
    );

    it('accepts a reviewed page one label under the hub', () => {
        expect(checkMiniAppLink('Carrot', 'https://carrot.apps.chatic.io/')).toBeNull();
    });
});

describe('parseMiniAppLinks', () => {
    const link = (id: string, name = `App ${id}`, url = `https://${id}.example/`) => ({ id, name, url });

    it('reads the stored list in its order', () => {
        const stored = JSON.stringify([link('a'), link('b')]);
        expect(parseMiniAppLinks(stored)).toEqual([link('a'), link('b')]);
    });

    it.each([[null], [''], ['not json'], ['{"id":"a"}'], ['"https://a.example/"']])('reads %j as no links', stored => {
        expect(parseMiniAppLinks(stored)).toEqual([]);
    });

    it('drops an entry the rules no longer pass, and a repeated id', () => {
        const stored = JSON.stringify([
            link('a'),
            link('b', 'Port', 'https://b.example:8443/'),
            link('c', ''),
            { id: 'd', name: 'No url' },
            link('a', 'Again'),
            link('f', 'Hub page', 'https://apps.chatic.io/other'),
            link('e'),
        ]);
        expect(parseMiniAppLinks(stored).map(l => l.id)).toEqual(['a', 'e']);
    });

    it(`keeps no more than ${MINI_APP_LINK_LIMIT}`, () => {
        const stored = JSON.stringify(Array.from({ length: MINI_APP_LINK_LIMIT + 2 }, (_, i) => link(`id${i}`)));
        expect(parseMiniAppLinks(stored)).toHaveLength(MINI_APP_LINK_LIMIT);
    });
});
