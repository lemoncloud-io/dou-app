import { useCustomMutation } from '@chatic/shared';
import type { CloudBody, CloudView } from '@lemoncloud/chatic-backend-api';
import { updateCloud } from '../../api';

export const useUpdateCloud = () =>
    useCustomMutation<CloudView, string, { id: string; body: CloudBody }>(({ id, body }) => updateCloud(id, body));
