import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import type { ISubWebViewService } from '../../services/subWebView/types';
import type { RootStackParamList } from '../core/navigation/type';

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
