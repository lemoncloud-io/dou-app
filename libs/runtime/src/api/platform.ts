import type { IssueReportOrigin } from './diagnostics/types';
import type { DeviceEnvironment } from '@chatic/transport';

export interface RuntimePlatform {
    issueOrigin: IssueReportOrigin;
    device: () => DeviceEnvironment;
}

let handedIn: RuntimePlatform | null = null;

export const providePlatform = (platform: RuntimePlatform): void => {
    handedIn = platform;
};

export const resetPlatformForTests = (): void => {
    handedIn = null;
};

export const handedInPlatform = (): RuntimePlatform | null => handedIn;
