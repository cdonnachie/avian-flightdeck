'use client';

import {
    Wallet,
    Send,
    QrCode,
    History,
    Loader,
    Lock,
    Unlock,
    HelpCircle,
    Server,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
// SendForm builds and signs transactions, so it pulls the ~1.7 MB secp256k1 build. Loading it
// lazily keeps the crypto out of the home page's initial bundle — the balance and history render
// immediately, and the send UI (and its crypto) loads when the user opens the Send tab.
const SendForm = dynamic(() => import('@/components/SendForm'), {
    ssr: false,
    loading: () => (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading send form…</div>
    ),
});
import ReceiveContent from '@/components/ReceiveContent';
import WalletSettingsDashboard from '@/components/WalletSettingsDashboard';
import { TransactionHistory } from '@/components/TransactionHistory';
import ConnectionStatus from '@/components/ConnectionStatus';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import WelcomeDialog from '@/components/WelcomeDialog';
import AboutModal from '@/components/AboutModal';
import { AppLayout } from '@/components/AppLayout';
import { BalanceInstrument } from '@/components/BalanceInstrument';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Home() {
    const router = useRouter();
    const { wallet, balance, balanceStatus, address, isLoading, processingProgress, updateBalance } = useWallet();
    const { lockWallet, isLocked } = useSecurity();
    const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'history'>('send');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
    const [showAboutModal, setShowAboutModal] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);

    const fullRefreshRequestedRef = useRef(false);

    // Check for terms acceptance on initial load
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const termsAcceptedValue = localStorage.getItem('terms-accepted');
            if (!termsAcceptedValue) {
                router.push('/terms');
                return;
            }
            setTermsAccepted(true);
        }
    }, [router]);

    // Check if wallet exists on initial load - only after terms are accepted
    useEffect(() => {
        const checkWalletExists = async () => {
            if (termsAccepted && typeof window !== 'undefined') {
                // Add a small delay to ensure wallet context has time to initialize
                await new Promise(resolve => setTimeout(resolve, 100));

                // First check localStorage for wallet data
                const walletData = localStorage.getItem('wallets') || localStorage.getItem('activeWallet');

                // Also check using StorageService for more accurate detection
                try {
                    const { StorageService } = await import('@/services/core/StorageService');
                    const hasWallet = await StorageService.hasWallet();

                    // Only show welcome dialog if no wallet exists and no address is loaded
                    if (!hasWallet && !walletData && !address) {
                        setShowWelcomeDialog(true);
                    }
                } catch (error) {
                    // Fallback to localStorage check if StorageService fails
                    if (!walletData && !address && !isLoading) {
                        setShowWelcomeDialog(true);
                    }
                }
            }
        };

        checkWalletExists();
    }, [termsAccepted, address, isLoading]);

    const formatBalance = (balance: number) => {
        const avnBalance = (balance / 100000000).toFixed(8); // Convert satoshis to AVN
        return avnBalance;
    };

    const formatAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 8)}...${address.slice(-8)}`;
    };

    const handleCopyAddress = async (address: string) => {
        try {
            await navigator.clipboard.writeText(address);
            setCopiedAddress(address);
            toast.success('Address copied to clipboard', {
                description: 'Wallet address has been copied successfully',
            });

            // Reset the copied state after 2 seconds
            setTimeout(() => {
                setCopiedAddress(null);
            }, 2000);
        } catch (error) {
            toast.error('Copy Failed', {
                description: 'Could not copy address to clipboard',
            });
        }
    };
    const handleRefresh = async () => {
        try {
            setIsRefreshing(true);

            // Check if this is a full refresh (long press) or just a balance update
            const isFullRefresh = fullRefreshRequestedRef.current;
            fullRefreshRequestedRef.current = false;

            if (isFullRefresh && wallet?.reprocessTransactionHistory) {
                // Full refresh requested - reprocess all transactions

                toast.info('Full refresh in progress', {
                    description: 'Reprocessing all transactions...',
                    duration: 3000,
                });
                await wallet.reprocessTransactionHistory();
                toast.success('Transaction history fully refreshed');
            } else {
                // Regular refresh - just update balance and any new transactions
                if (updateBalance) {
                    await updateBalance();
                    // Regular refresh doesn't need to reprocess all transactions
                    await wallet?.refreshTransactionHistory();
                }
            }
        } catch (error) {
            toast.error('Refresh failed', {
                description: 'Could not update balance information',
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    // Track press duration for the refresh button
    const pressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleRefreshMouseDown = () => {
        pressTimer.current = setTimeout(() => {
            fullRefreshRequestedRef.current = true;
            toast.info('Full refresh requested', {
                description: 'Reprocessing all transactions...',
            });
        }, 1500); // 1.5 seconds for long press
    };

    const handleRefreshMouseUp = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
        }
    };

    // Don't render the main app until terms acceptance has been checked
    if (termsAccepted === null) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex items-center space-x-2">
                    <Loader className="h-6 w-6 animate-spin text-avian-600" />
                    <span className="text-gray-600 dark:text-gray-400">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <AppLayout
            headerProps={{
                title: 'Avian FlightDeck',
                subtitle: 'Your cryptocurrency wallet',
                icon: Wallet,
                actions: (
                    <div className="flex items-center space-x-2">
                        {/* Lock Button */}
                        {address && (
                            <Button
                                onClick={() => lockWallet()}
                                variant="ghost"
                                size="icon"
                                className="w-9 h-9"
                                aria-label="Lock wallet"
                                title="Lock wallet"
                            >
                                {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                            </Button>
                        )}

                        {/* Help Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-9 h-9"
                            onClick={() => setShowAboutModal(true)}
                            title="About wallet & FAQ"
                        >
                            <HelpCircle className="h-4 w-4" />
                        </Button>

                        {/* Theme Switcher */}
                        <ThemeSwitcher />
                    </div>
                )
            }}
        >
            {/* Multi-panel dashboard for desktop, single column for mobile */}
            <div className="block lg:hidden max-w-xl md:max-w-2xl space-y-6">
                {/* Mobile layout */}

                {/* Balance instrument */}
                <BalanceInstrument
                    className="mb-6"
                    balance={balance}
                    balanceStatus={balanceStatus}
                    address={address ?? null}
                    isLoading={isLoading}
                    processingProgress={processingProgress}
                    isRefreshing={isRefreshing}
                    copied={copiedAddress === address}
                    formatBalance={formatBalance}
                    onRefresh={handleRefresh}
                    onRefreshMouseDown={handleRefreshMouseDown}
                    onRefreshMouseUp={handleRefreshMouseUp}
                    onCopy={handleCopyAddress}
                />

                {/* Navigation Tabs */}
                <Tabs
                    value={activeTab}
                    onValueChange={(value) =>
                        setActiveTab(value as 'send' | 'receive' | 'history')
                    }
                    className="mb-6 border-b border-gray-200 dark:border-gray-700"
                >
                    <TabsList className="flex h-auto bg-background p-0 w-full">
                        <TabsTrigger
                            value="send"
                            className="flex-1 flex flex-col items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-background rounded-tl-lg text-muted-foreground h-auto relative"
                        >
                            <Send className="h-4 w-4 mr-2" />
                            <span>Send</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="receive"
                            className="flex-1 flex  flex-col items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-background rounded-none text-muted-foreground h-auto relative"
                        >
                            <QrCode className="h-4 w-4 mr-2" />
                            <span>Receive</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="history"
                            className="flex-1 flex flex-col items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-background rounded-br-lg rounded-tr-lg text-muted-foreground h-auto relative"
                        >
                            <History className="h-4 w-4 mr-2" />
                            <span>History</span>
                        </TabsTrigger>
                    </TabsList>

                    <Card className="mt-2">
                        <CardContent className="p-0">
                            <TabsContent value="send" className="m-0">
                                <SendForm />
                            </TabsContent>
                            <TabsContent value="receive" className="m-0">
                                <ReceiveContent address={address || ''} />
                            </TabsContent>
                            <TabsContent value="history" className="m-0">
                                <TransactionHistory />
                            </TabsContent>
                        </CardContent>
                    </Card>
                </Tabs>

                {/* Connection Status */}
                <Card>
                    <CardContent className="p-0">
                        <ConnectionStatus />
                    </CardContent>
                </Card>
            </div>

            {/* Desktop Multi-Panel Dashboard */}
            <div className="hidden lg:block lg:max-w-7xl">
                {/* Balance instrument - Full Width */}
                <BalanceInstrument
                    className="mb-8"
                    balance={balance}
                    balanceStatus={balanceStatus}
                    address={address ?? null}
                    isLoading={isLoading}
                    processingProgress={processingProgress}
                    isRefreshing={isRefreshing}
                    copied={copiedAddress === address}
                    formatBalance={formatBalance}
                    onRefresh={handleRefresh}
                    onRefreshMouseDown={handleRefreshMouseDown}
                    onRefreshMouseUp={handleRefreshMouseUp}
                    onCopy={handleCopyAddress}
                />

                <div className="grid grid-cols-12 gap-8">
                    {/* Send Panel - Left top */}
                    <div className="col-span-12 lg:col-span-6 xl:col-span-6">
                        <Card className="h-full rounded-none rounded-t-md">
                            <CardHeader className="flex flex-row items-center gap-2 border-b border-border/60 bg-card px-4 py-3 text-foreground [&_svg]:text-primary rounded-t-md">
                                <Send className="h-5 w-5 mr-2 flex-shrink-0" />
                                <CardTitle className="text-lg">Send AVN</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 pt-2">
                                <SendForm />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Receive Panel - Right top */}
                    <div className="col-span-12 lg:col-span-6 xl:col-span-6">
                        <Card className="h-full rounded-t-md">
                            <CardHeader className="flex flex-row items-center gap-2 border-b border-border/60 bg-card px-4 py-3 text-foreground [&_svg]:text-primary rounded-t-md">
                                <QrCode className="h-5 w-5 mr-2 flex-shrink-0" />
                                <CardTitle className="text-lg">Receive AVN</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 pt-2">
                                <ReceiveContent address={address || ''} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Transaction History - Full width bottom */}
                    <div className="col-span-12">
                        <Card className="h-full rounded-t-md">
                            <CardHeader className="flex flex-row items-center gap-2 border-b border-border/60 bg-card px-4 py-3 text-foreground [&_svg]:text-primary rounded-t-md">
                                <History className="h-5 w-5 mr-2 flex-shrink-0" />
                                <CardTitle className="text-lg">Transaction History</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <TransactionHistory />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Connection Status - Full width at bottom */}
                    <div className="col-span-12">
                        <Card className="h-full rounded-t-md">
                            <CardHeader className="flex flex-row items-center gap-2 border-b border-border/60 bg-card px-4 py-3 text-foreground [&_svg]:text-primary rounded-t-md">
                                <Server className="h-5 w-5 mr-2 flex-shrink-0" />
                                <CardTitle className="text-lg">Connection Status</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <ConnectionStatus />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Welcome Dialog */}
            {showWelcomeDialog && <WelcomeDialog onClose={() => setShowWelcomeDialog(false)} />}

            {/* About Modal */}
            <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
        </AppLayout>
    );
}
