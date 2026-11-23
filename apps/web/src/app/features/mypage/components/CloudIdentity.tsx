import { CloudAvatar } from '@chatic/web-ui-kit';

interface CloudIdentityProps {
    name: string;
    children?: React.ReactNode;
}

export const CloudIdentity = ({ name, children }: CloudIdentityProps) => (
    <div className="flex flex-col items-center gap-4 px-4">
        <CloudAvatar name={name} size="xl" />
        <span className="max-w-full truncate text-[18px] font-semibold leading-[1.4] text-foreground">{name}</span>
        {children}
    </div>
);
