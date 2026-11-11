import { useCustomMutation } from '@chatic/shared';

import { userGateway } from '@chatic/transport';

import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

/**
 * Push-token registration as a react-query mutation, for a screen that registers by hand (apps/web's
 * push debug screen). The runtime's own registration (`PushRegistration` in `@chatic/runtime-core`,
 * started by `useDeviceTokenRegistration`) calls the same gateway method directly, with no React in it.
 *
 * Still on the gateway rather than the repository: `DeviceRepository` is the socket lane
 * (`device.sync`/`device.update-remote`) and has no push-token registration action.
 */
export const useRegisterDeviceTokenMutation = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody & { force?: boolean }>(
        ({ force, ...body }) => userGateway().registerDevice(body, { force })
    );
