import { CloudAvatar } from '@chatic/web-ui-kit';

interface CloudIdentityProps {
    name: string;
    /** Rendered under the name — the places screen puts its section label there. */
    children?: React.ReactNode;
}

/**
 * The cloud's avatar and name, centred — the head of every screen under one cloud (the hub, the
 * information screen, the places list). The cloud model has no image, so the avatar is the same
 * initials disc the switcher draws, at the design's 86px.
 */
export const CloudIdentity = ({ name, children }: CloudIdentityProps) => (
    <div className="flex flex-col items-center gap-4 px-4">
        <CloudAvatar name={name} size="xl" />
        <span className="max-w-full truncate text-[18px] font-semibold leading-[1.4] text-foreground">{name}</span>
        {children}
    </div>
);
