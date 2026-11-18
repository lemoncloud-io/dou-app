import type { PageRepositories } from '@chatic/runtime-client';

import { runtimeData } from '@chatic/runtime-client';

/**
 * The repositories of the session's live scope, through the engine: the same object on every render,
 * without the token issuers or the graph's lifecycle.
 */
export const useRuntimeRepositories = (): PageRepositories => runtimeData().repositories();
