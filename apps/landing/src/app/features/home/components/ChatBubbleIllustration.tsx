import { Logo } from '@chatic/assets';

export const ChatBubbleIllustration = (): JSX.Element => {
    return (
        <div className="relative w-full max-w-[696px] md:max-w-[426px] xl:max-w-[696px] h-[343px] md:h-auto md:aspect-square mx-auto">
            {/* Mascot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <img
                    src={Logo.logo}
                    alt="DoU mascot"
                    className="w-[166px] h-[157px] md:w-[200px] md:h-[189px] xl:w-[278px] xl:h-[263px] drop-shadow-2xl animate-float"
                />
            </div>

            {/* "Hello!" bubble - top left */}
            <div
                className="absolute top-0 left-[10%] bg-[#F8F8F8]
                           px-[22px] py-3 md:px-8 md:py-4 xl:px-10 xl:py-4
                           rounded-bl-[22px] rounded-br-[22px] rounded-tr-[22px] rounded-tl-none
                           md:rounded-bl-[28px] md:rounded-br-[28px] md:rounded-tr-[28px] md:rounded-tl-none
                           xl:rounded-bl-[42px] xl:rounded-br-[42px] xl:rounded-tr-[42px] xl:rounded-tl-none
                           shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                           animate-fade-in-up animate-delay-200"
            >
                <span className="text-[22px] md:text-[28px] xl:text-[46px] font-medium text-[#171725]">Hello!</span>
            </div>

            {/* "Welcome~" bubble - top right */}
            <div
                className="absolute top-[10%] right-[5%] bg-navy
                           px-[22px] py-3 md:px-8 md:py-4 xl:px-10 xl:py-4
                           rounded-bl-[22px] rounded-br-[22px] rounded-tl-[22px] rounded-tr-none
                           md:rounded-bl-[28px] md:rounded-br-[28px] md:rounded-tl-[28px] md:rounded-tr-none
                           xl:rounded-bl-[42px] xl:rounded-br-[42px] xl:rounded-tl-[42px] xl:rounded-tr-none
                           shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                           animate-fade-in-up animate-delay-300"
            >
                <span className="text-[22px] md:text-[28px] xl:text-[46px] font-medium text-white">Welcome~</span>
            </div>

            {/* Bottom-left emoji bubble - light bg, 🤝🫶 */}
            <div
                className="absolute bottom-0 left-[10%] bg-[#F8F8F8]
                           px-[22px] py-3 md:px-8 md:py-4 xl:px-10 xl:py-4
                           rounded-bl-[22px] rounded-br-[22px] rounded-tr-[22px] rounded-tl-none
                           md:rounded-bl-[28px] md:rounded-br-[28px] md:rounded-tr-[28px] md:rounded-tl-none
                           xl:rounded-bl-[42px] xl:rounded-br-[42px] xl:rounded-tr-[42px] xl:rounded-tl-none
                           shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                           animate-fade-in animate-delay-400"
            >
                <span
                    role="img"
                    aria-label="handshake and heart hands"
                    className="text-[22px] md:text-[28px] xl:text-[46px] tracking-[5px]"
                >
                    🤝🫶
                </span>
            </div>

            {/* Bottom-right emoji bubble - dark bg, 😊☺️ */}
            <div
                className="absolute bottom-[5%] right-[8%] bg-navy
                           px-[22px] py-3 md:px-8 md:py-4 xl:px-10 xl:py-4
                           rounded-bl-[22px] rounded-br-[22px] rounded-tl-[22px] rounded-tr-none
                           md:rounded-bl-[28px] md:rounded-br-[28px] md:rounded-tl-[28px] md:rounded-tr-none
                           xl:rounded-bl-[42px] xl:rounded-br-[42px] xl:rounded-tl-[42px] xl:rounded-tr-none
                           animate-fade-in animate-delay-500"
            >
                <span
                    role="img"
                    aria-label="smiling faces"
                    className="text-[22px] md:text-[28px] xl:text-[46px] tracking-[5px]"
                >
                    😊☺️
                </span>
            </div>
        </div>
    );
};
