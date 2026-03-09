import { Images } from '@chatic/assets';

/**
 * Chat bubble illustration component for the landing page.
 * Displays three chat bubble rows with character avatars.
 */
export const ChatBubbleIllustration = (): JSX.Element => {
    return (
        <div className="flex flex-col gap-8 items-center w-full max-w-[375px] px-8">
            {/* Row 1: Hello bubble with green avatar (left aligned) */}
            <div className="flex gap-1.5 items-center self-start">
                <div className="relative size-[52px] rounded-full bg-[rgba(176,234,16,0.4)]">
                    <img
                        src={Images.dou1}
                        alt="Character 1"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[42px] object-cover"
                        style={{ filter: 'drop-shadow(-1px 1px 3px rgba(0,0,0,0.12))' }}
                    />
                </div>
                <div className="bg-[#f6f6f6] px-3 py-2 rounded-tr-[14px] rounded-br-[14px] rounded-bl-[14px]">
                    <span className="text-[#171725] text-base font-medium tracking-[-0.288px] leading-[1.28]">
                        Hello!
                    </span>
                </div>
            </div>

            {/* Row 2: Welcome bubble with blue avatar (right aligned) */}
            <div className="flex gap-1.5 items-center self-end -mt-4">
                <div className="bg-[#102346] px-3 py-2 rounded-tl-[14px] rounded-br-[14px] rounded-bl-[14px]">
                    <span className="text-white text-base font-medium tracking-[-0.288px] leading-[1.28]">
                        Welcome~
                    </span>
                </div>
                <div className="relative size-[52px] rounded-full bg-[#edf5ff]">
                    <img
                        src={Images.dou2}
                        alt="Character 2"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[42px] object-cover"
                        style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.12))' }}
                    />
                </div>
            </div>

            {/* Main text */}
            <div className="text-center text-[28px] font-semibold text-black leading-[1.35] tracking-[-0.56px]">
                <p className="mb-0">안전한 대화공간에서</p>
                <p>자유롭게 소통하기!</p>
            </div>

            {/* Row 3: Emoji bubble with cactus avatar (center) */}
            <div className="flex gap-1.5 items-center justify-center">
                <div className="relative size-[52px] rounded-full bg-[rgba(176,234,16,0.4)]">
                    <img
                        src={Images.dou1}
                        alt="Character 3"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[42px] object-cover"
                        style={{ filter: 'drop-shadow(-1px 1px 3px rgba(0,0,0,0.12))' }}
                    />
                </div>
                <div className="bg-[#f6f6f6] px-3 py-2 rounded-tr-[14px] rounded-br-[14px] rounded-bl-[14px]">
                    <span className="text-[#171725] text-base font-medium tracking-[1.76px] leading-[1.28]">
                        😊🤝🫶
                    </span>
                </div>
            </div>
        </div>
    );
};
