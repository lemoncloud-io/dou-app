import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';

export interface AddCloudFlowResult {
    requestAddCloud: () => void;
}

export const useAddCloudFlow = (): AddCloudFlowResult => ({
    requestAddCloud: useAddCloudRequest(s => s.requestAddCloud),
});
