import { SubWebViewService } from '../../services/subWebView/SubWebViewService';
import { routeSubWebViewEvents } from './routeSubWebViewEvents';

const createService = () =>
    new SubWebViewService({ warn: jest.fn(), error: jest.fn() } as any, () => 'view-1');

const createNavigation = (currentRoute: { name: string; params?: unknown } | undefined) => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
    getCurrentRoute: jest.fn(() => currentRoute),
});

describe('routeSubWebViewEvents', () => {
    it('shows the sub WebView screen with the view when one opens', () => {
        const service = createService();
        const navigation = createNavigation({ name: 'Main' });
        routeSubWebViewEvents(service, navigation as any);

        service.open({ url: 'https://foo.apps.chatic.io/a', title: 'Notice' });

        expect(navigation.navigate).toHaveBeenCalledWith('SubWebView', {
            viewId: 'view-1',
            url: 'https://foo.apps.chatic.io/a',
            title: 'Notice',
            params: {},
            trust: 'reviewed',
        });
    });

    it('dismisses the screen showing the view that closed', () => {
        const service = createService();
        const navigation = createNavigation({ name: 'SubWebView', params: { viewId: 'view-1' } });
        routeSubWebViewEvents(service, navigation as any);
        service.open({ url: 'https://foo.apps.chatic.io/a' });

        service.close('view-1', 'host');

        expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    // A reload under the view still dismisses it; only the web goes untold.
    it('dismisses the screen when the web reloaded under it', () => {
        const service = createService();
        const navigation = createNavigation({ name: 'SubWebView', params: { viewId: 'view-1' } });
        routeSubWebViewEvents(service, navigation as any);
        service.open({ url: 'https://foo.apps.chatic.io/a' });

        service.resetForNewHost();

        expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    // The route check keeps a close from popping a screen that is not the view's.
    it('leaves the stack alone when the view is not the screen on top', () => {
        const service = createService();
        const navigation = createNavigation({ name: 'Main' });
        routeSubWebViewEvents(service, navigation as any);
        service.open({ url: 'https://foo.apps.chatic.io/a' });

        service.close('view-1', 'user');

        expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('stops routing once unsubscribed', () => {
        const service = createService();
        const navigation = createNavigation({ name: 'Main' });
        routeSubWebViewEvents(service, navigation as any)();

        service.open({ url: 'https://foo.apps.chatic.io/a' });

        expect(navigation.navigate).not.toHaveBeenCalled();
    });
});
