import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResolvedTheme } from '../../hooks';
import { subWebViewService } from '../../services';
import { SubWebView } from '../../subWebView';
import { t } from '../../utils';
import type { RootStackParamList } from '../core/navigation/type';

type SubWebViewScreenProps = NativeStackScreenProps<RootStackParamList, 'SubWebView'>;

/** Chrome only — a bar with the title and a close control over the page. */
export const SubWebViewScreen = ({ route, navigation }: SubWebViewScreenProps) => {
    const { viewId, url, title } = route.params;
    const [pageTitle, setPageTitle] = useState<string | undefined>(undefined);
    const insets = useSafeAreaInsets();
    const { isDark, backgroundColor } = useResolvedTheme();
    const foreground = isDark ? '#FFFFFF' : '#222325';

    const close = useCallback(() => {
        // The service dismisses the screen. If it no longer knows this view, nothing would: leave by
        // hand, since the screen has no other way out.
        const result = subWebViewService.close(viewId, 'user');
        if (!result.ok && navigation.canGoBack()) navigation.goBack();
    }, [viewId, navigation]);

    // Any way the screen leaves without the service hearing of it still counts as the user closing
    // it; once the service has closed the view this answers NOT_OPEN and does nothing.
    useEffect(() => () => void subWebViewService.close(viewId, 'user'), [viewId]);

    return (
        <View style={[styles.container, { backgroundColor, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.bar}>
                <Text style={[styles.title, { color: foreground }]} numberOfLines={1}>
                    {pageTitle ?? title ?? ''}
                </Text>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t('webview.subClose')}
                    hitSlop={12}
                    onPress={close}
                    style={styles.close}
                >
                    <Text style={[styles.closeGlyph, { color: foreground }]}>✕</Text>
                </TouchableOpacity>
            </View>
            <SubWebView url={url} onRequestClose={close} onTitleChange={setPageTitle} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    bar: {
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 8,
    },
    title: { flex: 1, fontSize: 16, fontWeight: '600' },
    close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { fontSize: 18 },
});
