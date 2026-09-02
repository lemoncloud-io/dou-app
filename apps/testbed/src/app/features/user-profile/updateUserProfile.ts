// Account-wide (user-level) profile edit, scoped to the active server (socket) context.
//
// The user repository derives cid/sid/uid from the live active-server request context, so the
// update already lands on whichever server the socket is connected to.
//
// It used to re-issue the active server's site session afterwards "so the session-derived identity
// reflects the change". That is vestigial: `UserRepositoryV2.updateProfile` writes the user cache
// itself (optimistically, then again from the server response, rolling back on failure), and
// `useRuntimeProfile` renders name/photo from that cache — it observes `user.observeItem(uid)`
// precisely so a profile edit fans out. Re-issuing a token changed nothing the UI reads, and it was
// the last caller keeping the whole cloud HTTP refresh chain alive (ADR-0070 불변조건 1·2).

export interface UpdateUserProfilePayload {
    name?: string;
    photo?: string;
}

export type UpdateProfileFn = (payload: UpdateUserProfilePayload) => Promise<unknown>;

/** Updates the user profile. Rejects without touching anything else if the update fails. */
export const updateUserProfile = async (
    updateProfile: UpdateProfileFn,
    payload: UpdateUserProfilePayload
): Promise<void> => {
    await updateProfile(payload);
};
