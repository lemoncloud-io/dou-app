import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, Globe, Shield, Zap } from 'lucide-react';

import { Logo } from '@lemon/assets';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';
import { useWebCoreStore } from '@lemon/web-core';

import { SettingsControl } from '../../../shared';

export const LandingPage = () => {
    const isAuthenticated = useWebCoreStore(state => state.isAuthenticated);
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [isVisible, setIsVisible] = useState(false);
    const heroRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const handleGetStarted = () => {
        if (isAuthenticated) {
            navigate('/home');
            return;
        }
        navigate('/auth/login');
    };

    const handleSignInOut = () => {
        if (isAuthenticated) {
            navigate('/auth/logout');
            return;
        }
        navigate('/auth/login');
    };

    const features = [
        {
            icon: <Zap className="w-8 h-8" />,
            title: t('landing.features.fast.title', 'Lightning Fast'),
            description: t(
                'landing.features.fast.desc',
                'Built for speed and performance with cutting-edge technology'
            ),
        },
        {
            icon: <Shield className="w-8 h-8" />,
            title: t('landing.features.secure.title', 'Secure & Private'),
            description: t('landing.features.secure.desc', 'Your data is protected with enterprise-grade security'),
        },
        {
            icon: <Globe className="w-8 h-8" />,
            title: t('landing.features.global.title', 'Global Access'),
            description: t('landing.features.global.desc', 'Access your content anywhere, anytime, on any device'),
        },
    ];

    return (
        <div className="min-h-screen relative overflow-hidden bg-lemon-cosmic animate-gradient">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-lemon-aurora animate-gradient opacity-50" />

            {/* Floating Orbs - Theme aware */}
            <div className="absolute top-20 left-10 w-32 h-32 bg-orange-500/15 dark:bg-orange-400/10 rounded-full blur-xl animate-float" />
            <div
                className="absolute top-40 right-20 w-24 h-24 bg-yellow-500/15 dark:bg-yellow-400/10 rounded-full blur-xl animate-float"
                style={{ animationDelay: '2s' }}
            />
            <div
                className="absolute bottom-32 left-1/4 w-40 h-40 bg-orange-400/15 dark:bg-orange-300/10 rounded-full blur-xl animate-float"
                style={{ animationDelay: '4s' }}
            />

            {/* Header */}
            <header className="relative z-10 px-6 py-8">
                <nav className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <img src={Logo.symbol} alt="symbol" className="w-8 h-8" />
                        <span className="text-2xl font-bold text-primary-content">LemonCloud</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <SettingsControl />
                        <Button
                            variant="outline"
                            className="glass border-white/30 dark:border-white/20 hover:bg-white/10 dark:hover:bg-white/5 text-primary-content"
                            onClick={handleSignInOut}
                        >
                            {isAuthenticated ? t('common.signout', 'Sign Out') : t('landing.signIn', 'Sign In')}
                        </Button>
                    </div>
                </nav>
            </header>

            {/* Hero Section */}
            <section ref={heroRef} className="relative z-10 px-6 py-20">
                <div className="max-w-4xl mx-auto text-center">
                    <div
                        className={`transition-all duration-1000 ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
                        }`}
                    >
                        <h1 className="text-6xl md:text-8xl font-bold text-primary-content mb-6 leading-tight">
                            {t('landing.hero.welcome', 'Welcome to the')}
                            <span className="text-lemon-gradient animate-gradient block">
                                {t('landing.hero.future', 'Future')}
                            </span>
                        </h1>

                        <p className="text-xl md:text-2xl text-secondary-content mb-12 max-w-2xl mx-auto leading-relaxed">
                            {t(
                                'landing.hero.description',
                                'Experience the next generation of cloud innovation. Fast, secure, and beautifully designed for the modern world.'
                            )}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button
                                size="lg"
                                className="bg-lemon-gradient hover:opacity-90 text-white border-0 hover:scale-105 transition-transform duration-200 animate-glow text-lg px-8 py-6"
                                onClick={handleGetStarted}
                            >
                                {t('landing.hero.getStarted', 'Get Started')}
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>

                            <Button
                                variant="outline"
                                size="lg"
                                className="glass border-white/30 dark:border-white/20 hover:bg-white/10 dark:hover:bg-white/5 text-primary-content text-lg px-8 py-6"
                                onClick={() => window.open('https://lemoncloud.io/', '_blank', 'noopener,noreferrer')}
                            >
                                {t('landing.hero.learnMore', 'Learn More')}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="relative z-10 px-6 py-20">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-4xl md:text-5xl font-bold text-primary-content text-center mb-16">
                        {t('landing.features.title', 'Why Choose LemonCloud?')}
                    </h2>

                    <div className="grid md:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <Card
                                key={index}
                                className={`glass p-8 text-center hover:scale-105 transition-all duration-300 border-0 animate-slide-up`}
                                style={{ animationDelay: `${index * 200}ms` }}
                            >
                                <div className="inline-flex items-center justify-center w-16 h-16 bg-lemon-gradient rounded-full mb-6 text-white">
                                    {feature.icon}
                                </div>
                                <h3 className="text-2xl font-semibold text-primary-content mb-4">{feature.title}</h3>
                                <p className="text-secondary-content leading-relaxed">{feature.description}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative z-10 px-6 py-20">
                <div className="max-w-4xl mx-auto text-center">
                    <Card className="glass-strong p-12 border-0">
                        <h2 className="text-4xl md:text-5xl font-bold text-primary-content mb-6">
                            {t('landing.cta.title', 'Ready to Get Started?')}
                        </h2>
                        <p className="text-xl text-secondary-content mb-8">
                            {t(
                                'landing.cta.description',
                                'Join thousands of users who are already experiencing the future.'
                            )}
                        </p>
                        <Button
                            size="lg"
                            className="bg-lemon-gradient hover:opacity-90 text-white border-0 hover:scale-105 transition-transform duration-200 text-lg px-12 py-6"
                            onClick={handleGetStarted}
                        >
                            {t('landing.cta.button', 'Start Your Journey')}
                            <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                    </Card>
                </div>
            </section>
        </div>
    );
};
