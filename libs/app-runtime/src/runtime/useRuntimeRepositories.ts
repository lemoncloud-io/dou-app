import type { DataRepositories } from '@chatic/data';

import { getRuntimeManager } from './RuntimeManager';

export const useRuntimeRepositories = (): DataRepositories => getRuntimeManager().getRepositories();
