import { Route, Routes } from 'react-router-dom';

import { ContactInvitePage, InviteWaitingPage, PlaceInviteLinkPage, PlaceInvitePage } from './pages';

/**
 * Invite sender flows, mounted at `/invite/*` — see routes/paths.ts. `contact` and `waiting` are the
 * relay 1:1 invite; `place/:placeId` (and its `link` screen) invites into a cloud place without a
 * room.
 */
export const InviteRoutes = () => {
    return (
        <Routes>
            <Route path="contact" element={<ContactInvitePage />} />
            <Route path="place/:placeId" element={<PlaceInvitePage />} />
            <Route path="place/:placeId/link" element={<PlaceInviteLinkPage />} />
            <Route path=":inviteId/waiting" element={<InviteWaitingPage />} />
        </Routes>
    );
};
