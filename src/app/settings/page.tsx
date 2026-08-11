'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Wallet,
    Shield,
    Archive,
    Bell,
    PlugZap,
    Settings,
    HelpCircle,
    ChevronRight
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/AppLayout';
import { HeaderActions } from '@/components/HeaderActions';
import RouteGuard from '@/components/RouteGuard';

interface SettingsCategory {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    path: string;
    color: string;
}

const settingsCategories: SettingsCategory[] = [
    {
        id: 'wallet',
        title: 'Wallet Management',
        description: 'Manage wallets, addresses, and encryption',
        icon: Wallet,
        path: '/settings/wallet',
        color: 'text-blue-600',
    },
    {
        id: 'security',
        title: 'Security Settings',
        description: 'Authentication, biometrics, and security features',
        icon: Shield,
        path: '/settings/security',
        color: 'text-green-600',
    },
    {
        id: 'backup',
        title: 'Backup & Recovery',
        description: 'Export, import, and backup your wallet data',
        icon: Archive,
        path: '/settings/backup',
        color: 'text-orange-600',
    },
    {
        id: 'notifications',
        title: 'Notifications',
        description: 'Configure alerts and notification preferences',
        icon: Bell,
        path: '/settings/notifications',
        color: 'text-purple-600',
    },
    {
        id: 'connected-sites',
        title: 'Connected Sites',
        description: 'Review and revoke dApps connected to this wallet',
        icon: PlugZap,
        path: '/settings/connected-sites',
        color: 'text-teal-600',
    },
    {
        id: 'advanced',
        title: 'Advanced Settings',
        description: 'Developer tools, logs, and advanced configuration',
        icon: Settings,
        path: '/settings/advanced',
        color: 'text-gray-600',
    },
    {
        id: 'help',
        title: 'Help & Support',
        description: 'Documentation, support, and app information',
        icon: HelpCircle,
        path: '/settings/help',
        color: 'text-indigo-600',
    },
];

export default function SettingsPage() {
    const router = useRouter();

    const handleCategoryClick = (path: string) => {
        router.push(path);
    };

    return (
        <RouteGuard requireTerms={true}>
            <AppLayout
                headerProps={{
                    actions: <HeaderActions />
                }}
            >
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Configure Your Wallet</h2>
                        <p className="text-muted-foreground">
                            Manage your wallet settings, security, and preferences
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        {settingsCategories.map((category) => {
                            const IconComponent = category.icon;
                            return (
                                <Card
                                    key={category.id}
                                    className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
                                    onClick={() => handleCategoryClick(category.path)}
                                >
                                    <CardHeader className="pb-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-lg bg-muted flex items-center justify-center`}>
                                                    <IconComponent className={`w-6 h-6 ${category.color}`} />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-lg">{category.title}</CardTitle>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {category.description}
                                                    </p>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                    </CardHeader>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </AppLayout>
        </RouteGuard>
    );
}
