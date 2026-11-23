import type { SubWebViewAppLinkTarget, SubWebViewStage } from '@chatic/shared';

const SUB_WEBVIEW_APPS: Readonly<Record<SubWebViewStage, Readonly<Record<string, string>>>> = {
    prod: {
        'dou-raise': 'https://dou-raise.apps.chatic.io',
        'dou-closer-word': 'https://dou-closer-word.apps.chatic.io',
        'dou-sky': 'https://dou-sky.apps.chatic.io',
    },
    dev: {
        'dou-raise': 'https://dou-raise.apps-dev.chatic.io',
        'dou-closer-word': 'https://dou-closer-word.apps-dev.chatic.io',
        'dou-sky': 'https://dou-sky.apps-dev.chatic.io',
    },
};

export const resolveSubWebViewAppUrl = async (
    { appId, query }: SubWebViewAppLinkTarget,
    stage: SubWebViewStage
): Promise<string | null> => {
    const apps = SUB_WEBVIEW_APPS[stage];
    const origin = Object.prototype.hasOwnProperty.call(apps, appId) ? apps[appId] : undefined;
    return origin ? `${origin}/${query}` : null;
};

export const miniAppHubUrl = (stage: SubWebViewStage): string =>
    stage === 'prod' ? 'https://apps.chatic.io/' : 'https://apps-dev.chatic.io/';
