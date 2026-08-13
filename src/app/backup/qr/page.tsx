'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import RouteGuard from '@/components/RouteGuard';
import { AppLayout } from '@/components/AppLayout';
import { HeaderActions } from '@/components/HeaderActions';
import QRTransfer from '@/components/QRTransfer';

export default function BackupQRPage() {
    const router = useRouter();
    // Restore is used by people who do NOT have a wallet yet (e.g. mid-onboarding), so honour a
    // ?tab=restore deep link and, in that case, don't gate the page behind an existing wallet.
    const searchParams = useSearchParams();
    const initialTab: 'backup' | 'restore' =
        searchParams.get('tab') === 'restore' ? 'restore' : 'backup';

    return (
        <RouteGuard requireTerms={true} requireWallet={initialTab !== 'restore'}>
            <AppLayout
                headerProps={{
                    title: 'QR Code Backup & Restore',
                    showBackButton: true,
                    actions: <HeaderActions />,
                }}
            >
                <div className="max-w-screen-2xl">
                    {/* Camera cleanup happens on QRTransfer unmount, so the default back button is fine. */}
                    <QRTransfer initialTab={initialTab} onRestored={() => router.push('/')} />
                </div>
            </AppLayout>
        </RouteGuard>
    );
}
