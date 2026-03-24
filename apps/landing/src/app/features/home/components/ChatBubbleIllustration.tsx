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

            {/* "Hello!" bubble - top left area */}
            <div
                className="absolute top-[10%] left-[5%] bg-[#F8F8F8]
                           px-[22px] py-3 md:px-8 md:py-3 xl:px-10 xl:py-4
                           rounded-bl-[22px] rounded-br-[22px] rounded-tr-[22px]
                           md:rounded-bl-[28px] md:rounded-br-[28px] md:rounded-tr-[28px]
                           xl:rounded-bl-[42px] xl:rounded-br-[42px] xl:rounded-tr-[42px]
                           rounded-tl-sm md:rounded-tl-sm xl:rounded-tl-sm
                           shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                           animate-fade-in-up animate-delay-200"
            >
                <span className="text-[22px] md:text-[28px] xl:text-[46px] font-medium text-navy">Hello!</span>
            </div>

            {/* "Welcome~" bubble - top right area */}
            <div
                className="absolute top-[5%] right-[5%] bg-navy
                           px-[22px] py-3 md:px-8 md:py-3 xl:px-10 xl:py-4
                           rounded-bl-[22px] rounded-br-[22px] rounded-tl-[22px]
                           md:rounded-bl-[28px] md:rounded-br-[28px] md:rounded-tl-[28px]
                           xl:rounded-bl-[42px] xl:rounded-br-[42px] xl:rounded-tl-[42px]
                           rounded-tr-sm md:rounded-tr-sm xl:rounded-tr-sm
                           shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                           animate-fade-in-up animate-delay-300"
            >
                <span className="text-[22px] md:text-[28px] xl:text-[46px] font-medium text-white">Welcome~</span>
            </div>

            {/* Bottom-left emoji bubble */}
            <div
                className="absolute bottom-[15%] left-[10%] bg-[#F8F8F8] px-3 py-2 xl:px-4 xl:py-3
                           rounded-full shadow-[2px_3px_16px_rgba(0,0,0,0.10)]
                           animate-fade-in animate-delay-400"
            >
                <span role="img" aria-label="wave">
                    👋
                </span>
            </div>

            {/* Bottom-right emoji bubble */}
            <div
                className="absolute bottom-[20%] right-[8%] bg-[#F8F8F8] px-3 py-2 xl:px-4 xl:py-3
                           rounded-full shadow-[2px_3px_16px_rgba(0,0,0,0.10)]
                           animate-fade-in animate-delay-500"
            >
                <span role="img" aria-label="smile">
                    😊
                </span>
            </div>
        </div>
    );
};
