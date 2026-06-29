import { User } from 'lucide-react';

import { useSessionIdentity } from '@chatic/web-core';

export const ProfileSection = () => {
    const user = useSessionIdentity().activeProfile?.$user;

    const name = user?.name;
    const email = user?.email ?? '';
    const photo = user?.photo;

    return (
        <div className="flex flex-col items-center gap-[9px] py-4">
            <div className="flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-full border border-background bg-secondary">
                {photo ? (
                    <img
                        src={photo}
                        alt={name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <User size={20} className="text-placeholder" />
                )}
            </div>
            <div className="flex flex-col items-center gap-[2px]">
                <span className="text-[17px] font-semibold leading-[1.19] tracking-[-0.025em] text-foreground">
                    {name}
                </span>
                <span className="text-[14px] font-normal leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                    {email}
                </span>
            </div>
        </div>
    );
};
