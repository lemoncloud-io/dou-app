import { Link } from 'react-router-dom';

export const Header = (): JSX.Element => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#eaeaec]">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between h-16 px-6 md:px-10">
            <Link to="/" className="text-[24px] font-bold text-[#222325]">
                DoU
            </Link>
            <nav className="flex items-center gap-6">
                <Link to="/policy/terms" className="text-[14px] text-[#53555b] hover:text-[#222325] transition-colors">
                    이용약관
                </Link>
                <Link
                    to="/policy/privacy"
                    className="text-[14px] text-[#53555b] hover:text-[#222325] transition-colors"
                >
                    개인정보처리방침
                </Link>
            </nav>
        </div>
    </header>
);
