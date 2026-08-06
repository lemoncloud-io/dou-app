import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import type { DomainPlace } from '@chatic/data';

import { CreatePlaceDialog } from '../components/CreatePlaceDialog';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';
import type { ProfileSaveFailure } from '../../../ui/components/PlaceProfileForm';
import { useSetMyPlaceProfile } from '../../../hooks';
import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { useCreatePlace, type CreatePlaceInput } from './useCreatePlace';

export interface CreatePlaceFlowResult {
    /** Opens the create-place overlay. Owner/limit gating stays with the caller (HomePage). */
    openCreatePlace: () => void;
    /** Render once in the host tree; holds the create dialog and its mandatory profile step. */
    createPlaceFlow: ReactNode;
}

/**
 * The "make the place real" work, held in a ref so a re-render can never restart it. `place` is
 * latched the moment the create succeeds, so a retry after a failed SWITCH resumes at the switch
 * instead of creating a second place.
 */
interface PlaceCreationJob {
    input: CreatePlaceInput;
    place: DomainPlace | null;
    ready: Promise<void> | null;
}

/**
 * The create-a-place flow: collect the place → collect the profile → commit both. The profile step
 * is the flow's LAST step and cannot be dismissed (no X / esc / overlay close): the creator is the
 * place's first member, so they get the same profile precondition as an invite acceptor — ADR-0045's
 * one deliberate exception to ADR-0039's "no forced profile step".
 *
 * The server work runs UNDERNEATH the profile step rather than in front of it: confirming the create
 * dialog kicks off `place.create` + the site switch and opens the profile step immediately, and the
 * profile write waits on that job before it goes out. The seconds the user spends typing a nick are
 * the seconds the server needs, so the wait is invisible — and, unlike the previous ordering, the
 * profile can no longer be written against a place that is not ready: its sid is pinned to the
 * created place instead of read off the ambient (optimistically pre-applied) context.
 *
 * Returns a node rather than raw open state (the useAddCloudFlow idiom) so this sequencing can only
 * ever live here.
 */
export const useCreatePlaceFlow = (): CreatePlaceFlowResult => {
    const { t } = useTranslation();
    const { createPlace } = useCreatePlace();
    const { switchSite } = useSiteSwitch();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isProfileStepOpen, setIsProfileStepOpen] = useState(false);
    // The name the user just typed. Used directly in the profile title instead of resolving the
    // active place, whose cache row does not exist yet while the create is still in flight.
    const [placeName, setPlaceName] = useState('');
    // Once the background job has failed, the mandatory step stops being mandatory. Without this a
    // permanently failing create (quota, rejected name) would trap the user in a dialog whose only
    // action is a retry that can never succeed.
    const [creationFailed, setCreationFailed] = useState(false);
    const jobRef = useRef<PlaceCreationJob | null>(null);

    const runJob = useCallback(
        async (job: PlaceCreationJob) => {
            if (!job.place) job.place = await createPlace(job.input);
            // switchSite returns early when the site is already selected, so a retry is a no-op.
            await switchSite(job.place.id);
        },
        [createPlace, switchSite]
    );

    const awaitPlaceReady = useCallback(
        async (job: PlaceCreationJob): Promise<DomainPlace> => {
            if (!job.ready) job.ready = runJob(job);
            try {
                await job.ready;
            } catch (error) {
                // Drop the settled rejection so the next submit retries the job instead of replaying
                // the same failure, and let the user out of the otherwise mandatory step.
                job.ready = null;
                setCreationFailed(true);
                // Name the failing step on the rejection: the form reads it there because a state
                // update made here has not re-rendered it by the time the throw arrives.
                const failure: ProfileSaveFailure = Object.assign(new Error('place-not-ready'), {
                    userMessage: t('createPlace.saveError'),
                    cause: error,
                });
                throw failure;
            }
            return job.place as DomainPlace;
        },
        [runJob, t]
    );

    const openCreatePlace = useCallback(() => {
        jobRef.current = null;
        setCreationFailed(false);
        setIsCreateOpen(true);
    }, []);

    const handleCreateSubmit = useCallback(
        (input: CreatePlaceInput) => {
            const job: PlaceCreationJob = { input, place: null, ready: null };
            jobRef.current = job;
            job.ready = runJob(job);
            // Nothing awaits the job until the profile step is submitted; attach a handler now so a
            // failure in between is logged rather than surfacing as an unhandled rejection. The
            // original promise still rejects for `awaitPlaceReady` — `catch` returns a new one.
            job.ready.catch(error => logger.error('PLACE', 'Failed to prepare the created place', { error }));

            setPlaceName(input.name);
            setCreationFailed(false);
            setIsProfileStepOpen(true);
        },
        [runJob]
    );

    const handleProfileSubmit = useCallback(
        async (value: { nick: string; thumbnail?: string }) => {
            const job = jobRef.current;
            if (!job) return;
            // Rejecting here surfaces the form's save error and keeps the step open to retry —
            // whether the place or the profile is what failed, retrying is the same next action.
            const place = await awaitPlaceReady(job);
            await setMyPlaceProfile(value, place.id);
        },
        [awaitPlaceReady, setMyPlaceProfile]
    );

    const createPlaceFlow = (
        <>
            <CreatePlaceDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} onSubmit={handleCreateSubmit} />
            <PlaceProfileCreateDialog
                open={isProfileStepOpen}
                placeName={placeName}
                dismissible={creationFailed}
                onSubmit={handleProfileSubmit}
                onDone={() => setIsProfileStepOpen(false)}
                // Reachable only after a failed job, where the place may or may not exist; the
                // room-settings nudge (ADR-0040) covers the profile from there.
                onExit={() => setIsProfileStepOpen(false)}
            />
        </>
    );

    return { openCreatePlace, createPlaceFlow };
};
