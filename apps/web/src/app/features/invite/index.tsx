import { Route, Routes } from 'react-router-dom';

import { ContactInvitePage, InviteWaitingPage, PlaceInvitePage } from './pages';

/**
 * Invite sender flows, mounted at `/invite/*` — see routes/paths.ts. `contact` and `waiting` are the
 * relay 1:1 invite; `place/:placeId` invites into a cloud place without a room.
 */
export const InviteRoutes = () => {
    return (
        <Routes>
            <Route path="contact" element={<ContactInvitePage />} />
            <Route path="place/:placeId" element={<PlaceInvitePage />} />
            <Route path=":inviteId/waiting" element={<InviteWaitingPage />} />
        </Routes>
    );
};
