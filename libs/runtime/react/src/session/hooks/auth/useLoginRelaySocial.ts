import { useMutation } from '@tanstack/react-query';
import { loginRelaySocialMutation } from '@chatic/runtime/api/session';

export const useLoginRelaySocial = () => useMutation({ mutationFn: loginRelaySocialMutation.mutationFn });
