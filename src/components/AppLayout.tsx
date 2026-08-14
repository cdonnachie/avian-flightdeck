'use client';

import React from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';
import GradientBackground from '@/components/GradientBackground';

interface AppLayoutProps {
    children: React.ReactNode;
    headerProps?: React.ComponentProps<typeof AppHeader>;
    sidebarProps?: React.ComponentProps<typeof AppSidebar>;
}

export function AppLayout({ children, headerProps, sidebarProps }: AppLayoutProps) {
    return (
        <SidebarProvider>
            <AppSidebar {...sidebarProps} />
            <SidebarInset className="min-w-0">
                <AppHeader {...headerProps} />
                <GradientBackground>
                    <main className="flex min-w-0 flex-1 flex-col gap-4 p-6 pt-4">
                        <div className="grid grid-cols-1 auto-rows-max items-start gap-6 md:gap-8 lg:col-span-2">
                            {children}
                        </div>
                    </main>
                </GradientBackground>
            </SidebarInset>
        </SidebarProvider>
    );
}

// Higher-order component for pages that need the full layout
export function withAppLayout<P extends object>(
    Component: React.ComponentType<P>,
    layoutProps?: Omit<AppLayoutProps, 'children'>
) {
    return function WrappedComponent(props: P) {
        return (
            <AppLayout {...layoutProps}>
                <Component {...props} />
            </AppLayout>
        );
    };
}
