interface StoreButtonProps {
    onClick?: () => void;
    href?: string;
    icon: JSX.Element;
    label: string;
    fullWidth?: boolean;
    width?: string;
}

export const StoreButton = ({
    onClick,
    href,
    icon,
    label,
    fullWidth,
    width = 'w-[198px]',
}: StoreButtonProps): JSX.Element => {
    const className = `inline-flex items-center justify-center gap-3
                       bg-navy text-white
                       px-8 py-4 rounded-full text-lg font-semibold tracking-[-0.27px]
                       transition-all duration-300
                       hover:opacity-90 active:scale-[0.98]
                       ${fullWidth ? 'flex-1' : width}`;

    if (href) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                <span className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">{icon}</span>
                {label}
            </a>
        );
    }

    return (
        <button type="button" onClick={onClick} className={`${className} cursor-pointer`}>
            <span className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">{icon}</span>
            {label}
        </button>
    );
};
