import { useActiveCloudData } from './activeCloudDataContext';
import type { ChannelUnreads } from './useChannelUnreads';

export const useActiveCloudUnreads = (): ChannelUnreads => useActiveCloudData().unreads;
