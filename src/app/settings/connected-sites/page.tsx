'use client';

import React from 'react';
import { AppLayout } from '@/components/AppLayout';
import ConnectedSitesPanel from '@/components/ConnectedSitesPanel';

export default function ConnectedSitesPage() {
    return (
        <AppLayout
            headerProps={{
                title: 'Connected Sites',
                showBackButton: true
            }}
        >
            <div className="max-w-screen-2xl">
                <ConnectedSitesPanel />
            </div>
        </AppLayout>
    );
}
