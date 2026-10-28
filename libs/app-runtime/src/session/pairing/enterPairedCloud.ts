import { isExchangeInFlight, issueCloudTokens } from '../auth/cloudTokens';
import { reissuePairedCloud } from './pairedCloudCheck';
import { pairedClouds } from './pairedClouds';

/**
 * Enters a cloud a pairing approved, as the account that approved it, and remembers it.
 *
 * The relay's delegation answers for the approver, so that is who this browser is in the cloud. A
 * switch, though, replays the tokens this tab already holds for the cloud when it has any — and a tab
 * that joined the same cloud on an invite of its own holds them under its own uid. Entered that way it
 * stayed itself until the next re-issue swapped it for the approver mid-session, with nothing on screen
 * to say so. So the tokens are re-issued through the delegation first, and the socket serving the
 * cloud, if one already does, moves onto them; the switch then finds the approval's tokens in the cache.
 *
 * An exchange for the cloud already on the wire (a renewal) began before the approval and answers for
 * whoever this tab was then, and a re-issue would join it rather than start its own. It is let finish
 * first, whatever it answers.
 *
 * Throws when the re-issue or the switch does, so the code screen can say the approval was lost.
 */
export const enterPairedCloud = async (
    cloudId: string,
    switchCloud: (cloudId: string) => Promise<unknown>
): Promise<void> => {
    if (isExchangeInFlight(cloudId)) {
        await issueCloudTokens(cloudId, { allowCache: false }).catch(() => undefined);
    }
    await reissuePairedCloud(cloudId);
    await switchCloud(cloudId);
    pairedClouds.add(cloudId);
};
