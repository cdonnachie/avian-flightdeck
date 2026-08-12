'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, Check, X, ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

// Import Shadcn UI components
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/AppLayout';
import { HeaderActions } from '@/components/HeaderActions';

export default function TermsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const [acceptanceChoice, setAcceptanceChoice] = useState<'accept' | 'decline' | null>(null);
    const [showDeclineDialog, setShowDeclineDialog] = useState(false);
    const [isCheckingTerms, setIsCheckingTerms] = useState(true);
    const [viewMode, setViewMode] = useState(false); // Track if we're in view mode

    // Reference to scroll content to check initial scroll position
    const scrollContentRef = useRef<HTMLDivElement>(null);

    // Check if terms are already accepted and redirect to main page (unless viewing)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isViewMode = searchParams.get('view') === 'true';
            setViewMode(isViewMode);

            const termsAccepted = localStorage.getItem('terms-accepted');
            const termsAcceptedDate = localStorage.getItem('terms-accepted-date');

            // One-time migration: Add date for existing users who accepted terms before date tracking
            if (termsAccepted && !termsAcceptedDate) {
                localStorage.setItem('terms-accepted-date', 'Before date tracking was implemented');
            }

            if (termsAccepted && !isViewMode) {
                router.push('/');
                return;
            }
            // Terms not accepted or in view mode, show the page
            setIsCheckingTerms(false);
        }
    }, [router, searchParams]);

    // Check initial scroll position when content loads
    useEffect(() => {
        const checkScrollPosition = () => {
            // Find the actual scrollable viewport in the Shadcn ScrollArea
            const viewport = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;

            if (viewport) {
                const { scrollTop, scrollHeight, clientHeight } = viewport;

                // Calculate if we're at the bottom with a small buffer
                const isAtBottom =
                    scrollHeight <= clientHeight + 10 || scrollTop + clientHeight >= scrollHeight - 10;

                // Only set to true if content is shorter than viewport or user has scrolled to bottom
                if (isAtBottom) {
                    setHasScrolledToBottom(true);
                } else {
                    // Reset if not at bottom - ensures the state is accurate
                    setHasScrolledToBottom(false);
                }
            }
        };

        // Check after content has had time to render
        const timer = setTimeout(checkScrollPosition, 100);
        const timer2 = setTimeout(checkScrollPosition, 500);
        const timer3 = setTimeout(checkScrollPosition, 1000);

        return () => {
            clearTimeout(timer);
            clearTimeout(timer2);
            clearTimeout(timer3);
        };
    }, []);

    // Handle scroll events
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        // Skip scroll handling if we've already scrolled to the bottom once
        if (hasScrolledToBottom) return;

        // Get the viewportNode - this is where scrolling happens in the ScrollArea component
        const viewportNode = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]');
        const target = viewportNode || e.currentTarget;

        // Adding a buffer (10px) to account for rounding and different browser calculations
        const isScrolledToBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 10;

        // Only update state if we've reached the bottom
        // Once set to true, this will never go back to false
        if (isScrolledToBottom) {
            setHasScrolledToBottom(true);
        }
    };

    const handleAccept = () => {
        if (acceptanceChoice === 'accept' && hasScrolledToBottom) {
            // Store acceptance in localStorage
            localStorage.setItem('terms-accepted', 'true');
            localStorage.setItem('terms-accepted-date', new Date().toLocaleDateString());

            // Dispatch custom event to notify SecurityContext
            window.dispatchEvent(new CustomEvent('terms-accepted', { detail: { accepted: true } }));

            // Navigate to main app
            router.push('/');
        } else if (acceptanceChoice === 'decline') {
            // Show the AlertDialog for declining terms
            setShowDeclineDialog(true);
        }
    };

    // Check if the content requires scrolling when the page loads
    useEffect(() => {
        // Add a slightly longer delay to ensure content is fully rendered
        const checkIfScrollNeeded = setTimeout(() => {
            const viewport = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
            if (viewport) {
                // If content is shorter than the viewport or already scrolled to bottom, no need to scroll
                if (viewport.scrollHeight <= viewport.clientHeight + 10) {
                    setHasScrolledToBottom(true);
                } else {
                    // Check if already at bottom (with buffer)
                    const isAtBottom =
                        viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 10;
                    if (isAtBottom) {
                        setHasScrolledToBottom(true);
                    }
                }
            }
        }, 1000);

        return () => clearTimeout(checkIfScrollNeeded);
    }, []);

    // Show loading state while checking terms acceptance
    if (isCheckingTerms) {
        return (
            <div className="min-h-screen bg-background">
                {/* Header Skeleton */}
                <div className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container max-w-4xl mx-auto px-4 py-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-6 w-6 rounded" />
                                <Skeleton className="h-8 w-64" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Skeleton */}
                <div className="container max-w-4xl mx-auto px-4 py-8">
                    <div className="space-y-6">
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <div className="space-y-4">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-96 w-full rounded-lg" />
                            <div className="space-y-4">
                                <Skeleton className="h-6 w-64" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <div className="flex gap-4 justify-end">
                                    <Skeleton className="h-12 w-32" />
                                    <Skeleton className="h-12 w-40" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // If in view mode, use AppLayout
    if (viewMode) {
        return (
            <AppLayout
                headerProps={{
                    title: 'Terms & License Agreement',
                    showBackButton: true,
                    actions: <HeaderActions />
                }}
            >
                <div className="space-y-6 max-w-screen-2xl">
                    {/* Notice */}
                    <Alert className="border-avian-200 dark:border-avian-800 bg-avian-50 dark:bg-avian-950/30">
                        <AlertTriangle className="h-5 w-5 text-avian-600" />
                        <AlertTitle className="font-medium text-avian-800 dark:text-avian-200">
                            Terms & License Agreement
                        </AlertTitle>
                        <AlertDescription className="text-avian-700 dark:text-avian-300">
                            MIT License. These are the terms you previously accepted.
                        </AlertDescription>
                    </Alert>

                    {/* License Content for View Mode */}
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl">License Agreement</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Card className="shadow-sm border border-border">
                                <ScrollArea className="h-96 rounded-lg bg-avian-50 dark:bg-avian-950">
                                    <CardContent className="p-6 space-y-4 text-sm text-muted-foreground leading-relaxed">
                                        <div>
                                            <h4 className="font-medium text-foreground dark:text-muted-foreground text-base">
                                                MIT License
                                            </h4>
                                            <p className="mt-2 text-muted-foreground">
                                                Copyright (c) 2024 The Avian Developers
                                            </p>
                                        </div>

                                        <p>
                                            Permission is hereby granted, free of charge, to any person obtaining a copy of this
                                            software and associated documentation files (the &quot;Software&quot;), to deal in
                                            the Software without restriction, including without limitation the rights to use,
                                            copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
                                            Software, and to permit persons to whom the Software is furnished to do so, subject
                                            to the following conditions:
                                        </p>

                                        <p>
                                            The above copyright notice and this permission notice shall be included in all copies
                                            or substantial portions of the Software.
                                        </p>

                                        <p className="font-medium text-foreground dark:text-muted-foreground">
                                            THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS
                                            OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
                                            FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
                                            COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
                                            ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
                                            SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
                                        </p>
                                    </CardContent>
                                </ScrollArea>
                            </Card>

                            {/* View mode message */}
                            <div className="mt-6 p-4 bg-avian-50 dark:bg-avian-900/20 border border-avian-200 dark:border-avian-800 rounded-lg">
                                <p className="text-sm text-avian-700 dark:text-avian-300">
                                    You are viewing the terms you previously accepted. These terms were accepted on {localStorage.getItem('terms-accepted-date') || 'an unknown date'}.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </AppLayout>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <img src="/Avian_logo.svg" alt="Avian" className="h-6 w-6 invert-0 dark:invert" />
                            <h1 className="text-2xl font-bold">Terms & License Agreement</h1>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container max-w-4xl mx-auto px-4 py-8">
                <div className="space-y-6">
                    {/* Notice */}
                    <Alert className="border-avian-200 dark:border-avian-800 bg-avian-50 dark:bg-avian-950/30">
                        <AlertTriangle className="h-5 w-5 text-avian-600" />
                        <AlertTitle className="font-medium text-avian-800 dark:text-avian-200">
                            Important Notice
                        </AlertTitle>
                        <AlertDescription className="text-avian-700 dark:text-avian-300">
                            MIT License. Please read and accept the terms below to continue using Avian FlightDeck.
                        </AlertDescription>
                    </Alert>

                    {/* License Content */}
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl">License Agreement</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Card className="shadow-sm border border-border">
                                <ScrollArea
                                    className="h-96 rounded-lg bg-avian-50 dark:bg-avian-950"
                                    onScrollCapture={handleScroll}
                                >
                                    <CardContent
                                        ref={scrollContentRef}
                                        className="p-6 space-y-4 text-sm text-muted-foreground leading-relaxed"
                                    >
                                        <div>
                                            <h4 className="font-medium text-foreground dark:text-muted-foreground text-base">
                                                MIT License
                                            </h4>
                                            <p className="mt-2 text-muted-foreground">
                                                Copyright (c) 2024 The Avian Developers
                                            </p>
                                        </div>

                                        <p>
                                            Permission is hereby granted, free of charge, to any person obtaining a copy of this
                                            software and associated documentation files (the &quot;Software&quot;), to deal in
                                            the Software without restriction, including without limitation the rights to use,
                                            copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
                                            Software, and to permit persons to whom the Software is furnished to do so, subject
                                            to the following conditions:
                                        </p>

                                        <p>
                                            The above copyright notice and this permission notice shall be included in all
                                            copies or substantial portions of the Software.
                                        </p>

                                        <p className="uppercase font-medium text-foreground dark:text-muted-foreground">
                                            The Software is provided &quot;as is&quot;, without warranty of any kind, express or
                                            implied, including but not limited to the warranties of merchantability, fitness for
                                            a particular purpose and noninfringement. In no event shall the authors or copyright
                                            holders be liable for any claim, damages or other liability, whether in an action of
                                            contract, tort or otherwise, arising from, out of or in connection with the software
                                            or the use or other dealings in the software.
                                        </p>

                                        <Separator className="my-6" />

                                        <div className="space-y-4">
                                            <h4 className="font-medium text-foreground dark:text-muted-foreground text-base">
                                                Important Disclaimer
                                            </h4>
                                            <p>
                                                This software is provided for educational and informational purposes. Users are
                                                responsible for ensuring compliance with applicable laws and regulations in their
                                                jurisdiction.
                                            </p>
                                            <p>
                                                The authors and contributors of this software do not provide financial, legal, or
                                                investment advice. Any use of this software is at your own risk.
                                            </p>
                                        </div>

                                        <Separator className="my-6" />

                                        <div className="space-y-4">
                                            <h4 className="font-medium text-foreground dark:text-muted-foreground text-base">
                                                Privacy Notice
                                            </h4>
                                            <p>
                                                This application operates entirely on your device. No personal data, wallet
                                                information, or transaction details are transmitted to external servers without
                                                your explicit consent.
                                            </p>
                                            <p>
                                                All wallet data is stored locally on your device and is encrypted when a password
                                                is set. You are responsible for backing up your wallet information.
                                            </p>
                                        </div>
                                    </CardContent>
                                </ScrollArea>
                            </Card>

                            {/* Scroll indicator */}
                            {!hasScrolledToBottom && (
                                <div className="mt-4 flex items-center justify-center">
                                    <div className="text-center bg-avian-100 dark:bg-avian-900 text-avian-600 dark:text-avian-300 px-4 py-2 rounded-full text-sm font-medium animate-pulse">
                                        Scroll down to read complete terms
                                    </div>
                                </div>
                            )}

                            {/* Agreement Section - Only show if not in view mode */}
                            {!viewMode && (
                                <div className="mt-6 space-y-6">
                                    <h4 className="text-lg font-medium text-foreground dark:text-white">
                                        Make your selection:
                                    </h4>

                                    <RadioGroup
                                        value={acceptanceChoice || ''}
                                        onValueChange={(value) => setAcceptanceChoice(value as 'accept' | 'decline')}
                                    >
                                        <div className="flex items-start space-x-3 p-4 rounded-lg border border-avian-200 dark:border-avian-700 bg-avian-50 dark:bg-avian-900/20 hover:bg-avian-100 dark:hover:bg-avian-900/30 transition-colors">
                                            <RadioGroupItem
                                                value="accept"
                                                id="accept-terms"
                                                disabled={!hasScrolledToBottom}
                                                className="text-avian-600 dark:text-avian-400 mt-0.5"
                                            />
                                            <Label
                                                htmlFor="accept-terms"
                                                className={`text-sm font-medium cursor-pointer leading-relaxed ${hasScrolledToBottom
                                                    ? 'text-avian-700 dark:text-avian-300'
                                                    : 'text-muted-foreground'
                                                    }`}
                                            >
                                                I accept the terms of the License Agreement and agree to use Avian FlightDeck
                                                under these conditions
                                            </Label>
                                        </div>

                                        <div className="flex items-start space-x-3 p-4 rounded-lg border border-border bg-muted/40 dark:bg-card hover:bg-muted/40 dark:hover:bg-card transition-colors">
                                            <RadioGroupItem
                                                value="decline"
                                                id="decline-terms"
                                                className="text-muted-foreground mt-0.5"
                                            />
                                            <Label
                                                htmlFor="decline-terms"
                                                className="text-sm font-medium text-muted-foreground cursor-pointer leading-relaxed"
                                            >
                                                I do not accept the terms of the License Agreement
                                            </Label>
                                        </div>
                                    </RadioGroup>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:justify-end pt-4">
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowDeclineDialog(true)}
                                            className="w-full sm:w-auto border-border text-muted-foreground hover:bg-muted/40 dark:hover:bg-card"
                                            size="lg"
                                        >
                                            <X className="w-4 h-4 mr-2" />
                                            Close Application
                                        </Button>

                                        <Button
                                            onClick={handleAccept}
                                            disabled={
                                                !acceptanceChoice || (acceptanceChoice === 'accept' && !hasScrolledToBottom)
                                            }
                                            className="w-full sm:w-auto bg-avian-600 hover:bg-avian-700 dark:bg-avian-600 dark:hover:bg-avian-700 text-white transition-colors disabled:bg-avian-600/50 dark:disabled:bg-avian-600/50 disabled:text-white/70"
                                            size="lg"
                                        >
                                            <Check className="w-4 h-4 mr-2" />
                                            Enter FlightDeck
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* View mode message */}
                            {viewMode && (
                                <div className="mt-6 p-4 bg-avian-50 dark:bg-avian-900/20 border border-avian-200 dark:border-avian-800 rounded-lg">
                                    <p className="text-sm text-avian-700 dark:text-avian-300">
                                        You are viewing the terms you previously accepted. These terms were accepted on {localStorage.getItem('terms-accepted-date') || 'an unknown date'}.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Decline Confirmation Dialog */}
            <AlertDialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-caution">
                            <AlertTriangle className="h-5 w-5" />
                            Terms Agreement Required
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            <p>You must accept the terms to use Avian FlightDeck.</p>
                            <p>
                                If you do not accept the terms, please close this browser tab or window to exit the application.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => setShowDeclineDialog(false)}
                            className="border-border"
                        >
                            Return to Terms
                        </AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
