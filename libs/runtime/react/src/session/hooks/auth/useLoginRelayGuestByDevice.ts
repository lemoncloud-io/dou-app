import { useMutation } from '@tanstack/react-query';
import { loginRelayGuestByDeviceMutation } from '@chatic/runtime/api/session';

export const useLoginRelayGuestByDevice = () => useMutation({ mutationFn: loginRelayGuestByDeviceMutation.mutationFn });
