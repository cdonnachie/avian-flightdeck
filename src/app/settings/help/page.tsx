'use client';

import { useRouter } from 'next/navigation';
import { Info, FileText, ExternalLink } from 'lucide-react';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/AppLayout';
import { HeaderActions } from '@/components/HeaderActions';

export default function HelpSettingsPage() {
    const router = useRouter();

    const sections = [
        {
            id: 'about',
            title: 'About Avian Wallet',
            description: 'App version, build info, and acknowledgments',
            icon: Info,
            action: () => router.push('/about'),
        },
        {
            id: 'terms',
            title: 'Terms & Privacy',
            description: 'Terms of service and privacy policy',
            icon: FileText,
            action: () => router.push('/terms?view=true'),
        },
        {
            id: 'docs',
            title: 'Documentation',
            description: 'User guides and documentation',
            icon: ExternalLink,
            action: () => window.open('https://github.com/AvianNetwork/avian-flightdeck', '_blank'),
        },
    ];

    return (
        <AppLayout
            headerProps={{
                title: 'Help & Support',
                showBackButton: true,
                actions: <HeaderActions />
            }}
        >
            <div className="space-y-6 max-w-screen-2xl">
                <div>
                    <h2 className="text-lg font-semibold mb-2">Get Help</h2>
                    <p className="text-muted-foreground">
                        Find answers, documentation, and support resources
                    </p>
                </div>

                <div className="grid gap-4">
                    {sections.map((section) => {
                        const IconComponent = section.icon;
                        return (
                            <Card
                                key={section.id}
                                className="cursor-pointer hover:shadow-lg transition-all duration-200"
                                onClick={section.action}
                            >
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <IconComponent className="w-6 h-6 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">{section.title}</CardTitle>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {section.description}
                                            </p>
                                        </div>
                                    </div>
                                </CardHeader>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </AppLayout>
    );
}
