import type { DataRepositories } from '@chatic/data';

import { getDataManager } from '@chatic/runtime-core';

export const useRuntimeRepositories = (): DataRepositories => getDataManager().getRepositories();
