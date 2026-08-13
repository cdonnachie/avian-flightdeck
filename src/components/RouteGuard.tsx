'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StorageService } from '@/services/core/StorageService';
import { AttitudeIndicator } from '@/components/AttitudeIndicator';
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

    // Show loading screen while checking — a branded PFD "coming online" instrument.
    if (isChecking) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#0D1B21] px-4">
                <div className="w-full max-w-xs">
                    <div className="relative aspect-[4/3.1] overflow-hidden rounded-2xl border border-[#24404A] bg-[linear-gradient(180deg,#163139,#122730)] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
                        <AttitudeIndicator />
                    </div>
                    <p className="mt-4 text-center text-sm text-[#9DB4BC]">Loading…</p>
                </div>
            </div>
        );
    }

    // Only render children if authorized
    return isAuthorized ? <>{children}</> : null;
}
