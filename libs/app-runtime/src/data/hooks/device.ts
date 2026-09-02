import { useCustomMutation } from '@chatic/shared';

import { userGateway } from '../../http/gateways';

import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

/**
 * Push-token registration. The one REST hook that stayed in the runtime.
 *
 * The rest of `data/hooks` went down to the apps (ADR-0070 결정 5, ②안 방향) because their only
 * consumers were app screens and react-query was their whole cache policy. This one is different:
 * the runtime itself calls it — `push/useDeviceTokenRegistration.ts` and
 * `session/hooks/app/useRegisterDeviceToken.ts` both register the device as part of session/push
 * boot, so it is runtime behavior, not a screen's data read.
 *
 * Still on the gateway rather than the repository: `DeviceRepositoryV2` is the socket lane
 * (`device.sync`/`device.update-remote`) and has no push-token registration action.
 */
export const useRegisterDeviceTokenMutation = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody & { force?: boolean }>(
        ({ force, ...body }) => userGateway().registerDevice(body, { force })
    );
