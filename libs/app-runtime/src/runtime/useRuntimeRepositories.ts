import type { DataRepositoriesV2 } from '@chatic/data';

import { getRuntimeManager } from './RuntimeManager';

export const useRuntimeRepositories = (): DataRepositoriesV2 => getRuntimeManager().getRepositories();
