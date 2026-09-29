import { isPendingUploadSlot, type DomainChat } from '@chatic/data';

// What a server upload carries that this screen reads, as measured on dev: `chat.feed` answers
// `{ id, status, stereo, orgUrl, thumbUrl }`, while `chat.send`'s own answer has no URL at all — the
// images appear once the feed is read again. The URLs are signed and short-lived: shown, never kept.
interface ServerSlot {
    id?: string;
    status?: string;
    error?: string;
    orgUrl?: string;
    thumbUrl?: string;
}

/** The images of one message: local previews while it is unsent, the server's once it is. */
export const UploadSlots = ({ slots }: { slots: NonNullable<DomainChat['upload$$']> }) => (
    <div className="grid grid-cols-3 gap-1">
        {slots.map((slot, index) => {
            if (isPendingUploadSlot(slot)) {
                return (
                    <figure key={index} className="relative">
                        <img src={slot.localThumbUrl} alt="" className="h-20 w-20 rounded object-cover opacity-70" />
                        <figcaption className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1 text-[9px] text-white">
                            {slot.localStatus}
                        </figcaption>
                    </figure>
                );
            }
            const upload = slot as ServerSlot;
            const src = upload.thumbUrl ?? upload.orgUrl;
            return (
                <figure key={upload.id ?? index} className="relative">
                    {src ? (
                        <a href={upload.orgUrl} target="_blank" rel="noreferrer">
                            <img src={src} alt="" className="h-20 w-20 rounded object-cover" />
                        </a>
                    ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded bg-muted text-[10px]">
                            {upload.error ?? 'no url yet'}
                        </div>
                    )}
                    <figcaption className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1 text-[9px] text-white">
                        {upload.status ?? '?'}
                        {upload.thumbUrl ? ' · thumb' : ''}
                    </figcaption>
                </figure>
            );
        })}
    </div>
);
