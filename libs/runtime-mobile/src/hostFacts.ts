import { Platform } from 'react-native';

export type PlatformSource = Pick<typeof Platform, 'OS'>;

export interface NativeHostFacts {
    readonly platform: PlatformSource['OS'];
    readonly userAgent: string;
}

export interface NativeHostFactsOptions {
    userAgent: string;
}

export const readNativeHostFacts = (
    { userAgent }: NativeHostFactsOptions,
    platform: PlatformSource = Platform
): NativeHostFacts => Object.freeze({ platform: platform.OS, userAgent });
