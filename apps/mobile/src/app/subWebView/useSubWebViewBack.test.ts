import { decideSubWebViewBack } from './useSubWebViewBack';

jest.mock('react-native', () => ({ BackHandler: { addEventListener: jest.fn() }, Platform: { OS: 'android' } }));

describe('decideSubWebViewBack', () => {
    it("gives the press to a page that claimed it, before the view's history", () => {
        expect(decideSubWebViewBack({ claimed: true, canGoBack: true })).toBe('page');
        expect(decideSubWebViewBack({ claimed: true, canGoBack: false })).toBe('page');
    });

    it('goes back in the view when the page has not claimed it', () => {
        expect(decideSubWebViewBack({ claimed: false, canGoBack: true })).toBe('history');
    });

    it('closes the view with nothing else to do', () => {
        expect(decideSubWebViewBack({ claimed: false, canGoBack: false })).toBe('close');
    });
});
