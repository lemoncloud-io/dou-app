import { useMutation } from '@tanstack/react-query';
import { refreshCloudToken } from '../../api';

export const useRefreshCloudToken = () => {
    return useMutation({
        mutationFn: refreshCloudToken,
    });
};
