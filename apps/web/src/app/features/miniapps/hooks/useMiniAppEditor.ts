import { useCallback, useState } from 'react';

import type { DomainMiniApp } from '@chatic/runtime';

import type { MiniAppEditing, MiniAppSheetFields } from '../components/MiniAppSheet';
import type { CloudMiniApps } from './useCloudMiniApps';

/**
 * The owner's sheet state and what its buttons do, for whichever screen hosts the sheet.
 *
 * Opening it is the owner's alone, and switching clouds closes it — a sheet left open on the previous
 * cloud would save into that cloud's list. A change sends only what differs from the mini app as it
 * was read, and never the switch of a held one (the relay keeps it until the hold is lifted).
 */
export const useMiniAppEditor = (miniApps: CloudMiniApps) => {
    const { cloudId, isOwner } = miniApps;
    const [state, setState] = useState<{ cloudId: string | null; editing: MiniAppEditing | null }>({
        cloudId,
        editing: null,
    });
    if (state.cloudId !== cloudId) setState({ cloudId, editing: null });
    const editing = isOwner && state.cloudId === cloudId ? state.editing : null;

    const submit = async (fields: MiniAppSheetFields, target: DomainMiniApp | null): Promise<void> => {
        if (!cloudId) throw new Error('No cloud is open');
        if (!target) {
            await miniApps.addMiniApp(cloudId, fields);
            return;
        }
        const patch: Partial<MiniAppSheetFields> = {};
        if (fields.name !== target.name) patch.name = fields.name;
        if (fields.url !== target.url) patch.url = fields.url;
        if (target.status !== 'held' && fields.enabled !== target.enabled) patch.enabled = fields.enabled;
        // Nothing changed: nothing to send, and the sheet closes as after a save.
        if (Object.keys(patch).length === 0) return;
        await miniApps.updateMiniApp(cloudId, target.id, patch);
    };

    const remove = async (target: DomainMiniApp): Promise<void> => {
        if (!cloudId) throw new Error('No cloud is open');
        await miniApps.removeMiniApp(cloudId, target.id);
    };

    /** Open the sheet on `target`, or `'new'` to add one. Does nothing for anyone but the owner. */
    const edit = useCallback(
        (target: MiniAppEditing) => {
            if (isOwner) setState({ cloudId, editing: target });
        },
        [isOwner, cloudId]
    );

    return {
        editing,
        edit,
        close: () => setState({ cloudId, editing: null }),
        submit,
        remove,
    };
};
