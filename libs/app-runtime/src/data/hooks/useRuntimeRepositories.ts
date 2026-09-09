import type { DataRepositories } from '@chatic/data';

import { getDataManager } from '../runtime';

export const useRuntimeRepositories = (): DataRepositories => getDataManager().getRepositories();
