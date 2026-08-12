'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StorageService } from '@/services/core/StorageService';
import { Loader } from 'lucide-react';
import GradientBackground from '@/components/GradientBackground';
import Image from 'next/image';
import { routeGuardLogger } from '@/lib/Logger';

interface RouteGuardProps {
    children: React.ReactNode;
    requireTerms?: boolean;
    requireWallet?: boolean;
    redirectTo?: string;
}

export default function RouteGuard({
    children,
    requireTerms = true,
    requireWallet = false,
    redirectTo = '/terms'
}: RouteGuardProps) {
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        const checkAccess = async () => {
            try {
                routeGuardLogger.info('Starting route access check', {
                    requireTerms,
                    requireWallet,
                    redirectTo
                });

                // Check terms acceptance if required
                if (requireTerms) {
                    const termsAccepted = localStorage.getItem('terms-accepted');
                    if (!termsAccepted) {
                        routeGuardLogger.info('Terms not accepted, redirecting to /terms');
                        router.push('/terms');
                        return;
                    }
                    routeGuardLogger.debug('Terms acceptance check passed');
                }

                // Check wallet existence if required
                if (requireWallet) {
                    const hasWallet = await StorageService.hasWallet();
                    if (!hasWallet) {
                        routeGuardLogger.info('No wallet found, redirecting to /onboarding');
                        router.push('/onboarding');
                        return;
                    }
                    routeGuardLogger.debug('Wallet existence check passed');
                }

                // All checks passed
                routeGuardLogger.info('All route guard checks passed, authorizing access');
                setIsAuthorized(true);
            } catch (error) {
                routeGuardLogger.error('Route guard check failed:', error);
                router.push(redirectTo);
            } finally {
                setIsChecking(false);
            }
        };

        checkAccess();
    }, [router, requireTerms, requireWallet, redirectTo]);

    // Show loading screen while checking
    if (isChecking) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-card to-background flex items-center justify-center relative">
                <GradientBackground>
                    <div className="flex flex-col items-center space-y-4 z-10">
                        <Image src="/avian_spinner.png" alt="Loading..." width={96} height={96} unoptimized />
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    </div>
                </GradientBackground>
            </div>
        );
    }

    // Only render children if authorized
    return isAuthorized ? <>{children}</> : null;
}
