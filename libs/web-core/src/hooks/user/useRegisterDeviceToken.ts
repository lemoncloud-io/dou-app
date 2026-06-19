import { useCustomMutation } from '@chatic/shared';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';
import { registerDeviceToken } from '../../api';

export const useRegisterDeviceTokenMutation = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody & { force?: boolean }>(
        ({ force, ...body }) => registerDeviceToken(body, { force })
    );
