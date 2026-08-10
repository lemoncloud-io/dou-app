import { cn } from '@chatic/lib/utils';

import { defaultPlaceAvatar, douHomeAvatar } from '../../resources/assets';
import { IconGroup, IconPlus, IconUser } from '../../resources/icons';

/** Share of the diameter the DoU character occupies — Figma 3769:34384 draws it 58 of 86. */
const HOME_GLYPH_RATIO = 58 / 86;

export interface ProfileAvatarProps {
    /** Image URL; when absent the `glyph` placeholder is shown. */
    src?: string;
    /** Alt text for the image. */
    alt?: string;
    /** Diameter in pixels. Defaults to the Figma spec (86). */
    size?: number;
    /**
     * Placeholder when there is no image: a single person ('user'), a group ('group'), a place
     * ('place' — the illustrated landscape, since a place is a space and not a person), or the
     * relay default place ('home' — the DoU character, see below).
     */
    glyph?: 'user' | 'group' | 'place' | 'home';
    /** When provided, the avatar becomes a button (e.g. to pick a photo). */
    onSelect?: () => void;
    /** Accessible label for the select action. */
    selectLabel?: string;
    className?: string;
}

/**
 * Profile avatar with a "+" badge — the Figma "Profile" component. A circular image (or placeholder
 * glyph) ringed by a hairline border, with a plus badge pinned bottom-right as the change-photo
 * affordance.
 *
 * The empty state depends on what the avatar stands for. A person is Figma's "1명 Profile"
 * (3177-13120): a brand-ink circle with the white solid silhouette — the same placeholder
 * {@link DefaultAvatar} draws, so a member with no photo looks identical whether they appear in a
 * list row or on this 86px profile. A place is the illustrated landscape instead (3408-27419): a
 * place is a space, so a person glyph would be wrong there.
 *
 * The badge is therefore light-on-dark (`bg-muted`), not the previous brand-ink fill: every
 * placeholder this component can show — person, group, or the illustrated default place image — is
 * dark, so a dark badge had no contrast to sit against.
 *
 * `glyph="home"` is the one light placeholder: the relay default place (DoU Home) stands for the
 * service, so Figma 3769:34384 shows the DoU character inset on a light `avatar-ring` disc rather
 * than a dark fill. It is the only variant that changes the circle itself, not just what sits in it —
 * and therefore the only one where the badge has to flip back to dark to stay visible.
 */
export const ProfileAvatar = ({
    src,
    alt = '',
    size = 86,
    glyph = 'user',
    onSelect,
    selectLabel = 'Select photo',
    className,
}: ProfileAvatarProps) => {
    const Root = onSelect ? 'button' : 'div';
    // Only the DoU character sits on a light disc; every other placeholder is white-on-brand-ink.
    const isLightDisc = !src && glyph === 'home';

    return (
        <Root
            {...(onSelect ? { type: 'button' as const, onClick: onSelect, 'aria-label': selectLabel } : {})}
            className={cn('relative inline-flex shrink-0', className)}
            style={{ width: size, height: size }}
        >
            <span
                className={cn(
                    'flex h-full w-full items-center justify-center overflow-hidden rounded-full',
                    isLightDisc ? 'bg-avatar-ring' : 'border border-avatar-ring bg-brand-ink'
                )}
            >
                {src ? (
                    <img src={src} alt={alt} className="h-full w-full object-cover" />
                ) : glyph === 'home' ? (
                    // An illustration with no circle of its own, so it is inset rather than full-bleed.
                    <img
                        src={douHomeAvatar}
                        alt={alt}
                        className="object-contain"
                        style={{
                            width: Math.round(size * HOME_GLYPH_RATIO),
                            height: Math.round(size * HOME_GLYPH_RATIO),
                        }}
                    />
                ) : glyph === 'place' ? (
                    // An illustration, not a glyph: it paints its own circle, so it goes full-bleed.
                    <img src={defaultPlaceAvatar} alt={alt} className="h-full w-full object-cover" />
                ) : glyph === 'group' ? (
                    // The group glyph is a plain icon, so it needs insetting to read as centred.
                    <IconGroup size={Math.round(size * 0.56)} className="text-white" />
                ) : (
                    // Full-size: the silhouette's viewBox matches the avatar circle, so it sits
                    // circle-relative exactly as in Figma (same as DefaultAvatar).
                    <IconUser size={size} className="text-white" />
                )}
            </span>
            {onSelect && (
                // The badge inverts against whatever it sits on. `bg-muted` (95% L) and
                // `bg-avatar-ring` (96% L) are a single lightness step apart, so the light badge
                // would all but vanish on the light disc.
                <span
                    className={cn(
                        'absolute -right-1 bottom-0 flex items-center justify-center rounded-full border-2 border-surface p-1.5',
                        isLightDisc ? 'bg-brand-ink' : 'bg-muted'
                    )}
                >
                    <IconPlus className={cn('h-[18px] w-[18px]', isLightDisc ? 'text-white' : 'text-label')} />
                </span>
            )}
        </Root>
    );
};
