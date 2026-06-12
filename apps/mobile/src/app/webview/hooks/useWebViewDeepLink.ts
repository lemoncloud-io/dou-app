import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { WEBVIEW_URL } from '../utils/constants';
import { logger } from '../../services';
import type { MainStackParamList } from '../../features/core/navigation';
import type { IAppBridgeHost } from '@chatic/bridges';

/**
 * 전달받은 경로/URL을 웹뷰의 로컬 주소 체계에 맞춰 정규화합니다.
 * 상대 경로(/auth/login)는 WEBVIEW_URL 기준으로 결합하고, custom scheme이나 다른 도메인은 base url로 매핑합니다.
 */
export const toLocalUrl = (url: string, webViewBaseUrl = WEBVIEW_URL): string => {
    try {
        if (url.startsWith('/')) {
            const baseUrl = webViewBaseUrl.endsWith('/') ? webViewBaseUrl.slice(0, -1) : webViewBaseUrl;
            return `${baseUrl}${url}`;
        }

        let normalized = url.trim();
        if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(normalized)) {
            normalized = `https://${normalized}`;
        }

        if (normalized.startsWith('chatic://')) {
            normalized = normalized.replace('chatic://', 'https://app.chatic.io/');
        } else if (normalized.startsWith('chatic-dev://')) {
            normalized = normalized.replace('chatic-dev://', 'https://app-dev.chatic.io/');
        }

        const parsed = new URL(normalized);
        const baseUrl = webViewBaseUrl.endsWith('/') ? webViewBaseUrl.slice(0, -1) : webViewBaseUrl;

        let pathname = parsed.pathname;
        if (!pathname.startsWith('/')) {
            pathname = `/${pathname}`;
        }

        return `${baseUrl}${pathname}${parsed.search}${parsed.hash}`;
    } catch (e) {
        logger.error('DEEPLINK', `toLocalUrl failed for: ${url}`, e);
        try {
            const schemeMatch = url.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)/);
            const pathAndQuery = schemeMatch ? schemeMatch[1] : url;
            const cleanPath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
            const baseUrl = webViewBaseUrl.endsWith('/') ? webViewBaseUrl.slice(0, -1) : webViewBaseUrl;
            return `${baseUrl}${cleanPath}`;
        } catch {
            return webViewBaseUrl;
        }
    }
};

type DeepLinkRouteParams = {
    url?: string;
    error?: string;
};

type ResolvedDeepLinkRouteParams = DeepLinkRouteParams & {
    isNestedNavigatorParams: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * React Navigation에서 전달된 라우트 파라미터 구조를 분석하여 딥링크 URL 및 에러 정보를 안전하게 추출합니다.
 * 중첩 네비게이터 파라미터 구조(params.params.url)도 지원합니다.
 */
const resolveDeepLinkRouteParams = (params: unknown): ResolvedDeepLinkRouteParams => {
    if (!isRecord(params)) {
        return { isNestedNavigatorParams: false };
    }

    const directUrl = typeof params.url === 'string' ? params.url : undefined;
    const directError = typeof params.error === 'string' ? params.error : undefined;

    if (directUrl || directError) {
        return {
            url: directUrl,
            error: directError,
            isNestedNavigatorParams: false,
        };
    }

    if (isRecord(params.params)) {
        const nestedUrl = typeof params.params.url === 'string' ? params.params.url : undefined;
        const nestedError = typeof params.params.error === 'string' ? params.params.error : undefined;

        if (nestedUrl || nestedError) {
            return {
                url: nestedUrl,
                error: nestedError,
                isNestedNavigatorParams: true,
            };
        }
    }

    return { isNestedNavigatorParams: false };
};

/**
 * 웹뷰 내 딥링크 및 푸시 알림의 동적 네비게이션을 담당하는 핵심 React Hook입니다.
 * URL 직접 이동 대신 OnNavigate 브릿지 이벤트를 사용하여 웹앱 내부에서 무중단 라우팅을 수행합니다.
 */
export const useWebViewDeepLink = (
    route: RouteProp<MainStackParamList, 'Main'>,
    options?: {
        webViewBaseUrl?: string;
        reloadToken?: number;
        bridge?: IAppBridgeHost;
    }
) => {
    const navigation = useNavigation<NavigationProp<MainStackParamList>>();
    const webViewBaseUrl = options?.webViewBaseUrl || WEBVIEW_URL;
    const reloadToken = options?.reloadToken ?? 0;
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const { url, error, isNestedNavigatorParams } = resolveDeepLinkRouteParams(route.params);

    // 앱 마운트 시점(콜드 스타트)의 초기 파라미터를 고정하여 캐싱합니다.
    const initialUrlParam = useRef(url).current;
    const initialError = useRef(error).current;
    const hasHandledInitialUrl = useRef(false);
    const handledRouteUrlRef = useRef<string | null>(null);
    const lastReloadTokenRef = useRef(reloadToken);

    // 콜드 스타트 시 딥링크가 있는 경우, 첫 로딩 시 리다이렉트 중임을 마킹하여 스플래시 화면을 유지합니다.
    const [isRedirecting, setIsRedirecting] = useState(!!initialUrlParam);

    // [중요] 웹뷰의 source는 딥링크 주소가 아닌 항상 기본 도메인 주소(base URL)로 고정하여 로드합니다.
    const [source] = useState<{ uri: string }>(() => {
        return { uri: webViewBaseUrl };
    });

    const [deepLinkError, setDeepLinkError] = useState(!!initialError);
    const [deepLinkErrorReason, setDeepLinkErrorReason] = useState<string | null>(initialError || null);

    /**
     * 네이티브 브릿지를 통해 웹앱으로 OnNavigate 이벤트를 발행합니다.
     * 웹이 아직 준비되지 않았다면 브릿지 호스트 내부 큐에 버퍼링됩니다.
     */
    const navigateToPath = useCallback(
        (path: string, reason: 'warm-start' | 'cold-start') => {
            if (options?.bridge) {
                logger.info(
                    'DEEPLINK',
                    `[useWebViewDeepLink] Pushing OnNavigate event via bridge (${reason}): ${path}`
                );
                options.bridge.pushEvent({
                    type: 'OnNavigate',
                    success: true,
                    data: {
                        path,
                        replace: false,
                    },
                });
            } else {
                logger.warn('DEEPLINK', '[useWebViewDeepLink] Bridge is not available for navigation', {
                    reason,
                    path,
                });
            }
        },
        [options?.bridge]
    );

    /**
     * React Navigation 라우트 파라미터를 정리하여 동일한 링크가 중복 처리되지 않도록 합니다.
     */
    const clearDeepLinkRouteParams = useCallback(
        (isNested: boolean) => {
            const nextParams = isNested
                ? { params: { url: undefined, error: undefined } }
                : { url: undefined, error: undefined };

            logger.info('DEEPLINK', '[useWebViewDeepLink] Clearing route params after URL handling', {
                isNestedNavigatorParams: isNested,
                nextParams,
            });
            navigation.setParams(nextParams as never);
        },
        [navigation]
    );

    /**
     * 웹뷰의 로드가 끝났을 때(onLoad) 호출됩니다.
     * 콜드 스타트 시, 웹페이지 리소스 로드가 완료되면 300ms 딜레이 후 로딩 스플래시를 걷어냅니다.
     */
    const handleWebViewLoad = useCallback(() => {
        logger.info('WEBVIEW', 'WebView loaded');
        setIsWebViewLoaded(true);

        if (isRedirecting) {
            setTimeout(() => {
                setIsRedirecting(false);
            }, 300);
        }
    }, [isRedirecting]);

    // 개발 디버그 메뉴 등에서 웹뷰가 새로고침(reloadToken 변경)되면 모든 상태를 리셋합니다.
    useEffect(() => {
        if (reloadToken === lastReloadTokenRef.current) return;

        lastReloadTokenRef.current = reloadToken;
        setIsWebViewLoaded(false);
        hasHandledInitialUrl.current = false;
        handledRouteUrlRef.current = null;
        logger.info('WEBVIEW', 'WebView source reset by debug settings', { webViewBaseUrl, reloadToken });
    }, [reloadToken, webViewBaseUrl]);

    // 라우트 파라미터(route.params) 업데이트를 통해 감지되는 딥링크(웜 스타트 및 콜드 스타트 초기 진입)를 처리합니다.
    useEffect(() => {
        if (error) {
            logger.error('DEEPLINK', `Deep link error received in route params: ${error}`);
            setDeepLinkError(true);
            setDeepLinkErrorReason(error);
            clearDeepLinkRouteParams(isNestedNavigatorParams);
            return;
        }

        if (!url) {
            handledRouteUrlRef.current = null;
            hasHandledInitialUrl.current = false;
            return;
        }

        // 콜드 스타트 진입 시 1회만 처리하도록 플래그를 관리합니다.
        if (url === initialUrlParam) {
            if (hasHandledInitialUrl.current) {
                logger.info('DEEPLINK', `Cold-start deep link already handled: ${url}`);
                clearDeepLinkRouteParams(isNestedNavigatorParams);
                return;
            }
            hasHandledInitialUrl.current = true;
        }

        if (url === handledRouteUrlRef.current) {
            logger.info('DEEPLINK', '[useWebViewDeepLink] Warm-start URL already handled for current route params', {
                url,
            });
            return;
        }
        handledRouteUrlRef.current = url;

        // 전체 URL 정보에서 상대 경로 및 쿼리 정보만 파싱하여 웹앱으로 넘겨줍니다.
        const targetUrl = toLocalUrl(url, webViewBaseUrl);
        const parsed = new URL(targetUrl);
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

        logger.info('DEEPLINK', '[useWebViewDeepLink] URL converted for WebView dynamic routing', {
            rawUrl: url,
            path,
            isWebViewLoaded,
            hasBridge: !!options?.bridge,
            isNestedNavigatorParams,
        });

        // 웹뷰가 현재 로드된 상태(웜 스타트)인지 혹은 초기 진입(콜드 스타트)인지 구분하여 이벤트를 보냅니다.
        if (isWebViewLoaded) {
            navigateToPath(path, 'warm-start');
        } else {
            logger.info('DEEPLINK', '[useWebViewDeepLink] WebView is not loaded yet; queuing dynamic route', {
                path,
            });
            // 브릿지 내부 버퍼에 이벤트를 적재하여 WebAppReady 수신 즉시 발송되게 함
            navigateToPath(path, 'cold-start');
        }

        clearDeepLinkRouteParams(isNestedNavigatorParams);
    }, [
        url,
        error,
        isNestedNavigatorParams,
        isWebViewLoaded,
        initialUrlParam,
        navigateToPath,
        clearDeepLinkRouteParams,
        webViewBaseUrl,
        options?.bridge,
    ]);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
        setDeepLinkErrorReason(null);
        clearDeepLinkRouteParams(isNestedNavigatorParams);
    }, [clearDeepLinkRouteParams, isNestedNavigatorParams]);

    return {
        source,
        handleWebViewLoad,
        isWebViewLoaded,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
        isRedirecting,
    };
};
