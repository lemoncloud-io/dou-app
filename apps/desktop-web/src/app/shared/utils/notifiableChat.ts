/** The fields a notifiability decision reads — satisfied by both `DomainChat` and `ChannelLastChat`. */
interface NotifiableCandidate {
    stereo?: string;
}

/**
 * Whether a chat should be allowed to reach the reader out-of-band — an OS banner or
 * the mentions inbox.
 *
 * Only messages people wrote qualify. Everything the server generates itself arrives
 * as `stereo === 'system'`: join and leave events today, and reaction events once the
 * contract package catches up. Those carry no readable body of their own, so without
 * this guard a banner fires with an empty message, and every reaction to your own
 * message would raise one.
 *
 * The guard is on `stereo` rather than the individual `subType`s on purpose. New
 * subtypes are added server-side before this build knows their names, and the default
 * for anything machine-generated is silence.
 *
 * This is the local WebSocket path. The server excludes its own events from *push*,
 * but that exclusion never reaches here — these banners are raised by the renderer
 * from live channel records, so the filtering has to happen on this side too.
 */
export const isNotifiableChat = (chat: NotifiableCandidate): boolean => chat.stereo !== 'system';
