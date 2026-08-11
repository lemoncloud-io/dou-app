import {
    ArrowUp,
    Check,
    CircleAlert,
    ChevronDown,
    Clock,
    House,
    ChevronLeft,
    ChevronRight,
    Image as ImageGlyph,
    Link2,
    Loader2,
    MessageCircle,
    type LucideIcon,
    type LucideProps,
    MoreHorizontal,
    Plus,
    Search,
    Sparkles,
    User,
    Users,
    X,
    Zap,
} from 'lucide-react';

/**
 * Central icon set for web-ui-kit. Components import semantic icons from here
 * (never `lucide-react` directly) so the icon library is swappable in one place
 * — e.g. replacing these with the Figma-exported SVG set later touches only this
 * file, not every component.
 *
 * All icons share the lucide API (size, className, strokeWidth, currentColor).
 */
export type IconProps = LucideProps;

export const IconBack: LucideIcon = ChevronLeft;
export const IconCheck: LucideIcon = Check;
export const IconAlert: LucideIcon = CircleAlert;
export const IconHome: LucideIcon = House;
export const IconChatBubble: LucideIcon = MessageCircle;
export const IconChevronDown: LucideIcon = ChevronDown;
export const IconChevronRight: LucideIcon = ChevronRight;
export const IconClose: LucideIcon = X;
export const IconMore: LucideIcon = MoreHorizontal;
export const IconPlus: LucideIcon = Plus;
export const IconSearch: LucideIcon = Search;
export const IconSend: LucideIcon = ArrowUp;
export const IconSpinner: LucideIcon = Loader2;
export const IconPlan: LucideIcon = Sparkles;
export const IconBolt: LucideIcon = Zap;
export const IconImage: LucideIcon = ImageGlyph;
export const IconLink: LucideIcon = Link2;
/** Outline person — grey placeholder slots only. Avatars use the solid `IconUser`. */
export const IconUserOutline: LucideIcon = User;
export const IconUsers: LucideIcon = Users;
export const IconClock: LucideIcon = Clock;

// Figma-exported custom glyphs (not lucide icons). See IconGroup.tsx / IconUser.tsx.
export { IconGroup, type IconGroupProps } from './IconGroup';
export { IconUser, type IconUserProps } from './IconUser';
export { IconChatAdd, type IconChatAddProps } from './IconChatAdd';
export { IconPin, type IconPinProps } from './IconPin';
// Duotone glyphs — filled shapes with a half/40%-opacity companion layer. Their lucide
// outline counterparts (IconClock, IconUsers, IconImage) remain exported: this barrel is
// the kit's single icon source, so an alias staying available without a current caller is
// the normal state, not dead code.
export { IconClockSolid, type IconClockSolidProps } from './IconClockSolid';
export { IconUsersGroup, type IconUsersGroupProps } from './IconUsersGroup';
export { IconImageSolid, type IconImageSolidProps } from './IconImageSolid';
export { IconGalleryAdd, type IconGalleryAddProps } from './IconGalleryAdd';
export { IconCheckCircleSolid, type IconCheckCircleSolidProps } from './IconCheckCircleSolid';
