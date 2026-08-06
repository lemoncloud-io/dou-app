import { useCallback, useState, type ReactNode } from 'react';

import { useActivePlaceName } from '../../../hooks/useActivePlaceName';
import { CreatePlaceDialog } from '../components/CreatePlaceDialog';
import { PlaceProfileCreateDialog } from '../components/PlaceProfileCreateDialog';

export interface CreatePlaceFlowResult {
    /** Opens the create-place overlay. Owner/limit gating stays with the caller (HomePage). */
    openCreatePlace: () => void;
    /** Render once in the host tree; holds the create dialog and its mandatory profile step. */
    createPlaceFlow: ReactNode;
}

/**
 * The create-a-place flow: place create (+site switch) → mandatory profile create. The profile
 * dialog is the flow's LAST step and cannot be dismissed (no X / esc / overlay close): the creator
 * is the place's first member, so they get the same profile precondition as an invite acceptor —
 * ADR-0045's one deliberate exception to ADR-0039's "no forced profile step". It opens only after
 * the site switch committed (`onCreated`); on a switch failure the flow ends silently and the
 * room-settings nudge (ADR-0040) covers the profile later.
 *
 * Returns a node rather than raw open state (the useAddCloudFlow idiom) so the create→profile
 * sequencing can only ever live here.
 */
export const useCreatePlaceFlow = (): CreatePlaceFlowResult => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isProfileStepOpen, setIsProfileStepOpen] = useState(false);
    // Resolves the just-created place's name once the switch committed (falls back to the branded
    // label / sid while the row is still being cached).
    const placeName = useActivePlaceName();

    const openCreatePlace = useCallback(() => setIsCreateOpen(true), []);

    const createPlaceFlow = (
        <>
            <CreatePlaceDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onCreated={() => setIsProfileStepOpen(true)}
            />
            <PlaceProfileCreateDialog
                open={isProfileStepOpen}
                placeName={placeName}
                dismissible={false}
                onDone={() => setIsProfileStepOpen(false)}
                // Unreachable while dismissible is false; wired so a future policy change fails safe.
                onExit={() => setIsProfileStepOpen(false)}
            />
        </>
    );

    return { openCreatePlace, createPlaceFlow };
};
