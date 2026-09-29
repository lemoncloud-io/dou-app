import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID } from '@chatic/data';

/**
 * A cloud id named the way the runtime names it: an unset or empty selection is the relay. A cache
 * partition and a sync target both use this form.
 */
export const toCloudId = (cid: string | null | undefined): string => cid || RELAY_CLOUD_ID;

/** The selected cloud, normalised. */
export const useSelectedCloudId = (): string => toCloudId(runtime.session.useSessionSelection().selectedCloudId);

/**
 * The selected cloud as it is right now, read outside render. Code resuming after an await has to
 * compare against this rather than the value its closure captured: the selection can move while the
 * await is pending, before any re-render has told the closure so.
 */
export const readSelectedCloudId = (): string => toCloudId(runtime.session.getGlobalSessionContext().cloud.cloudId);
