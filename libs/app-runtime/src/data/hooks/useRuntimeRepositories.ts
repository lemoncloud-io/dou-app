import type { DataRepositoriesV2 } from '@chatic/data';

import { getDataManager } from '../runtime';

export const useRuntimeRepositories = (): DataRepositoriesV2 => getDataManager().getRepositories();
