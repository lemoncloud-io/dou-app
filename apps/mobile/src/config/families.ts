import { Platform } from 'react-native';
import Config from 'react-native-config';

import { appleStore, googleStore } from '@chatic/checkout-store';
import type { StoreStrategy } from '@chatic/checkout-store';
import type { BadgeMirror, PushCopy } from '@chatic/push-mobile';
import type { OAuthServiceOptions } from '@chatic/sign-in-mobile';

import { BadgeSyncBridge } from '../app/bridge';
import { formatPushCopy, getEffectiveLanguage, t } from '../app/utils';

const csv = (raw: string | undefined): string[] =>
    (raw ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);

export const storeCheckout = (os: string = Platform.OS): StoreStrategy =>
    os === 'android'
        ? googleStore({
              skus: csv(Config.VITE_SUBSCRIPTION_IAP_SKUS_ANDROID),
              planOrder: csv(Config.VITE_SUBSCRIPTION_IAP_PLANS_ANDROID),
          })
        : appleStore({ skus: csv(Config.VITE_SUBSCRIPTION_IAP_SKUS_IOS) });

export const pushCopy: PushCopy = {
    channelName: channel => t(`notification.channel.${channel}`),
    localize: (locKey, locArgs, field) => formatPushCopy(locKey, locArgs, getEffectiveLanguage(), field),
};

export const pushBadgeMirror: BadgeMirror = BadgeSyncBridge;

export const signInOptions = (): OAuthServiceOptions => ({ googleWebClientId: Config.VITE_GOOGLE_WEB_CLIENT_ID });
