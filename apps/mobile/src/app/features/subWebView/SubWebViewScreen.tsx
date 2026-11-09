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

/**
 * What an `external` site — one a cloud's owner chose, under no review — is shown with: the base set,
 * and the bar. Nothing is read from the site itself, not even its `/.well-known` manifest, so it can
 * neither claim a permission nor hide DoU's bar and draw what looks like DoU in its place.
 */
const EXTERNAL_MANIFEST: ResolvedSubWebViewManifest = Object.freeze({
    permissions: new Set<never>(),
    display: 'standard',
    orientation: 'any',
});

/**
 * Chrome only — a floating close control alone by default, or for a `standard` page a bar with the
 * title and a close control over the page. The page's manifest decides which, its orientation and what its bridge
 * answers, so the page is not loaded until the manifest is in; until then the screen shows only the
 * close control, so even a manifest that never answers cannot keep the user in. An external site has
 * no manifest to wait for: it loads at once, with the bar titled with its host whatever the page or
 * the web asks.
 */
export const SubWebViewScreen = ({ route, navigation }: SubWebViewScreenProps) => {
    const { viewId, url, title, params, appId, trust } = route.params;
    const external = trust === 'external';
    const [manifest, setManifest] = useState<ResolvedSubWebViewManifest | null>(external ? EXTERNAL_MANIFEST : null);
    const [pageTitle, setPageTitle] = useState<string | undefined>(undefined);
    // A title the page asked for outranks the document's, which outranks the web's, which outranks
    // the manifest's name.
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
        // The store answers every failure itself; the catch is so that a page can never be left
        // unloaded behind a rejection.
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
        // The service dismisses the screen. If it no longer knows this view, nothing would: leave by
        // hand, since the screen has no other way out.
        const result = subWebViewService.close(viewId, 'user');
        if (!result.ok && navigation.canGoBack()) navigation.goBack();
    }, [viewId, navigation]);

    // The control asks the page first when it has its close guard on; the view decides. Before the
    // page is loaded there is no guard to ask.
    const onClosePress = useCallback(() => {
        if (viewRef.current) viewRef.current.requestClose('control');
        else close();
    }, [close]);

    // Any way the screen leaves without the service hearing of it still counts as the user closing
    // it; once the service has closed the view this answers NOT_OPEN and does nothing.
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

    const fullscreen = manifest?.display === 'fullscreen';

    return (
        // Every edge padded, so the page lies wholly inside the safe area and needs no insets of its
        // own — the sides too, for the notch in landscape. A fullscreen page loses the bar, not that.
        <View
            style={[
                styles.container,
                {
                    backgroundColor,
                    paddingTop: insets.top,
                    paddingBottom: insets.bottom,
                    paddingLeft: insets.left,
                    paddingRight: insets.right,
                },
            ]}
        >
            {manifest && !fullscreen && (
                <View style={styles.bar}>
                    <Text style={[styles.title, { color: foreground }]} numberOfLines={1}>
                        {external
                            ? (subWebViewOriginOf(url)?.slice('https://'.length) ?? '')
                            : (requestedTitle ?? pageTitle ?? title ?? manifest.name ?? '')}
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
                    onRequestClose={close}
                    onTitleChange={setPageTitle}
                    onTitleRequest={setRequestedTitle}
                />
            )}
            {(!manifest || fullscreen) && (
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
    // Legible over any page: a dark disc under a white glyph, whatever the page draws behind it.
    floating: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
});
