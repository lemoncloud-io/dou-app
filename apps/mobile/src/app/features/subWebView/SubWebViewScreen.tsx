import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackNavigationOptions, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SubWebViewOrientation } from '@chatic/bridge-messages';
import { subWebViewOriginOf } from '@chatic/shared/subWebViewTrust';

import { useResolvedTheme } from '../../hooks';
import {
    DEFAULT_SUB_WEBVIEW_MANIFEST,
    subWebViewManifestStore,
    subWebViewService,
    type ResolvedSubWebViewManifest,
} from '../../services';
import { SubWebView, type SubWebViewHandle } from '../../subWebView';
import { t } from '../../utils';
import { originOf } from '../../utils/url';
import type { RootStackParamList } from '../core/navigation/type';

type SubWebViewScreenProps = NativeStackScreenProps<RootStackParamList, 'SubWebView'>;

const ORIENTATION: Record<SubWebViewOrientation, NativeStackNavigationOptions['orientation']> = {
    any: 'default',
    portrait: 'portrait',
    landscape: 'landscape',
};

const EXTERNAL_MANIFEST: ResolvedSubWebViewManifest = Object.freeze({
    permissions: new Set<never>(),
    runtimePermissions: new Set<never>(),
    display: 'titled',
    orientation: 'any',
});

export const SubWebViewScreen = ({ route, navigation }: SubWebViewScreenProps) => {
    const { viewId, url, title, params, appId, trust } = route.params;
    const external = trust === 'external';
    const externalTitle = external ? (subWebViewOriginOf(url)?.slice('https://'.length) ?? '') : null;
    const [manifest, setManifest] = useState<ResolvedSubWebViewManifest | null>(external ? EXTERNAL_MANIFEST : null);
    const [pageTitle, setPageTitle] = useState<string | undefined>(undefined);
    const [requestedTitle, setRequestedTitle] = useState<string | undefined>(undefined);
    const insets = useSafeAreaInsets();
    const { isDark, backgroundColor } = useResolvedTheme();
    const viewRef = useRef<SubWebViewHandle>(null);
    const foreground = isDark ? '#FFFFFF' : '#222325';

    useEffect(() => {
        if (external) return;
        let live = true;
        const origin = originOf(url);
        const pending = origin ? subWebViewManifestStore.get(origin) : Promise.resolve(DEFAULT_SUB_WEBVIEW_MANIFEST);
        void pending
            .catch(() => DEFAULT_SUB_WEBVIEW_MANIFEST)
            .then(resolved => {
                if (!live) return;
                setManifest(resolved);
                navigation.setOptions({ orientation: ORIENTATION[resolved.orientation] });
            });
        return () => {
            live = false;
        };
    }, [url, external, navigation]);

    const close = useCallback(() => {
        const result = subWebViewService.close(viewId, 'user');
        if (!result.ok && navigation.canGoBack()) navigation.goBack();
    }, [viewId, navigation]);

    const onClosePress = useCallback(() => {
        if (viewRef.current) viewRef.current.requestClose('control');
        else close();
    }, [close]);

    useEffect(() => () => void subWebViewService.close(viewId, 'user'), [viewId]);

    const closeControl = (floating: boolean) => (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('webview.subClose')}
            hitSlop={12}
            onPress={onClosePress}
            style={floating ? [styles.close, styles.floating] : styles.close}
        >
            <Text style={[styles.closeGlyph, { color: floating ? '#FFFFFF' : foreground }]}>✕</Text>
        </TouchableOpacity>
    );

    const immersive = manifest?.display === 'immersive';
    const barless = manifest?.display === 'clean' || immersive;

    return (
        <View
            style={[
                styles.container,
                immersive
                    ? { backgroundColor }
                    : {
                          backgroundColor,
                          paddingTop: insets.top,
                          paddingBottom: insets.bottom,
                          paddingLeft: insets.left,
                          paddingRight: insets.right,
                      },
            ]}
        >
            {manifest && !barless && (
                <View style={styles.bar}>
                    <Text style={[styles.title, { color: foreground }]} numberOfLines={1}>
                        {externalTitle ?? requestedTitle ?? pageTitle ?? title ?? manifest.name ?? ''}
                    </Text>
                    {closeControl(false)}
                </View>
            )}
            {manifest && (
                <SubWebView
                    ref={viewRef}
                    viewId={viewId}
                    url={url}
                    params={params}
                    appId={appId}
                    permissions={manifest.permissions}
                    runtimePermissions={manifest.runtimePermissions}
                    trust={trust}
                    onRequestClose={close}
                    onTitleChange={setPageTitle}
                    onTitleRequest={setRequestedTitle}
                    display={manifest.display}
                    {...(immersive ? { insets } : {})}
                />
            )}
            {(!manifest || barless) && (
                <View style={[styles.floatingSlot, { top: insets.top + 8, right: insets.right + 8 }]}>
                    {closeControl(true)}
                </View>
            )}
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
    floatingSlot: { position: 'absolute' },
    floating: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
});
