import { resolveHeaderProfile } from './resolveHeaderProfile';

describe('resolveHeaderProfile', () => {
    it('tier 1: uses the site profile when its name or image is present', () => {
        expect(
            resolveHeaderProfile({
                siteName: 'Site Nick',
                siteImageUrl: 'site.png',
                accountName: 'Account',
                accountImageUrl: 'acc.png',
            })
        ).toEqual({ kind: 'site', name: 'Site Nick', imageUrl: 'site.png' });
    });

    it('tier 1: site is chosen even with only an image, and does not borrow the account name', () => {
        expect(resolveHeaderProfile({ siteName: '', siteImageUrl: 'site.png', accountName: 'Account' })).toEqual({
            kind: 'site',
            name: '',
            imageUrl: 'site.png',
        });
    });

    it('tier 2: falls back to the user account when both site fields are absent', () => {
        expect(
            resolveHeaderProfile({
                siteName: null,
                siteImageUrl: undefined,
                accountName: 'Account',
                accountImageUrl: 'acc.png',
            })
        ).toEqual({ kind: 'account', name: 'Account', imageUrl: 'acc.png' });
    });

    it('tier 2: account chosen with only a name (image stays undefined)', () => {
        expect(resolveHeaderProfile({ accountName: 'Account' })).toEqual({
            kind: 'account',
            name: 'Account',
            imageUrl: undefined,
        });
    });

    it('tier 3: returns the setup prompt when neither site nor account has any data', () => {
        expect(resolveHeaderProfile({})).toEqual({ kind: 'setup' });
        expect(
            resolveHeaderProfile({ siteName: '', siteImageUrl: '', accountName: '', accountImageUrl: null })
        ).toEqual({ kind: 'setup' });
    });
});
