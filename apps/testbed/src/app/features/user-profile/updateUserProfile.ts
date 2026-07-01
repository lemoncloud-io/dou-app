// Account-wide (user-level) profile edit, scoped to the active server (socket) context.
//
// The user repository derives cid/sid/uid from the live active-server request context, so the
// update already lands on whichever server the socket is connected to. After a successful update
// we re-issue the active server's site session so the session-derived identity reflects the change
// (mirrors apps/web's useUpdateCloudProfile → refreshCurrentCloudSession flow).

export interface UpdateUserProfilePayload {
    name?: string;
    photo?: string;
}

export type UpdateProfileFn = (payload: UpdateUserProfilePayload) => Promise<unknown>;
export type RefreshSessionFn = () => Promise<unknown>;

/**
 * Updates the user profile, then refreshes the active server session. Order matters: the session
 * refresh runs only after the profile update resolves, and a failed update rejects without
 * touching the session.
 */
export const updateUserProfile = async (
    updateProfile: UpdateProfileFn,
    refreshSession: RefreshSessionFn,
    payload: UpdateUserProfilePayload
): Promise<void> => {
    await updateProfile(payload);
    await refreshSession();
};
