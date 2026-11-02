import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import type { ISubWebViewService } from '../../services/subWebView/types';
import type { RootStackParamList } from '../core/navigation/type';

/**
 * Shows the sub WebView screen when the service opens a view, and dismisses it when the view
 * closes, whoever closed it. The navigator is always ready by the time a view opens: only the web
 * asks for one, and the web runs inside `MainScreen`.
 */
export const routeSubWebViewEvents = (
    service: ISubWebViewService,
    navigation: NavigationContainerRefWithCurrent<RootStackParamList>
) =>
    service.subscribe(event => {
        if (event.type === 'opened') {
            navigation.navigate('SubWebView', event.view);
            return;
        }
        const route = navigation.getCurrentRoute();
        const params = route?.params as RootStackParamList['SubWebView'] | undefined;
        if (route?.name === 'SubWebView' && params?.viewId === event.viewId && navigation.canGoBack()) {
            navigation.goBack();
        }
    });
