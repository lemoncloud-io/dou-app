import type { PageRepositories } from '@chatic/runtime-client';

import { runtimeData } from '@chatic/runtime-client';

export const useRuntimeRepositories = (): PageRepositories => runtimeData().repositories();
