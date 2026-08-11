'use client';

import {
    Wallet,
    Send,
    QrCode,
    Settings,
    RefreshCw,
    History,
    Loader,
    Lock,
    Unlock,
    Copy,
    HelpCircle,
    Server,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SendForm from '@/components/SendForm';
import ReceiveContent from '@/components/ReceiveContent';
import WalletSettingsDashboard from '@/components/WalletSettingsDashboard';
import { TransactionHistory } from '@/components/TransactionHistory';
import ConnectionStatus from '@/components/ConnectionStatus';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import GradientBackground from '@/components/GradientBackground';
import WelcomeDialog from '@/components/WelcomeDialog';
import AboutModal from '@/components/AboutModal';
import { AppLayout } from '@/components/AppLayout';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

                {/* Wallet Card */}
                <Card className="mb-6 wallet-card relative bg-avian-600">
                    <CardHeader className="py-3 px-4 relative z-10">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-base sm:text-lg md:text-xl text-white">
                                Balance
                            </CardTitle>
                            <Button
                                onClick={handleRefresh}
                                onMouseDown={handleRefreshMouseDown}
                                onMouseUp={handleRefreshMouseUp}
                                onMouseLeave={handleRefreshMouseUp}
                                onTouchStart={handleRefreshMouseDown}
                                onTouchEnd={handleRefreshMouseUp}
                                disabled={isRefreshing}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 md:h-8 md:w-8 text-white hover:text-white/80"
                                title="Refresh balance (hold for full refresh)"
                            >
                                <RefreshCw
                                    className={`w-3 h-3 md:w-4 md:h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                                />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-xl md:text-2xl lg:text-3xl font-bold mb-2 flex items-center flex-wrap text-white">
                            {isLoading && !processingProgress.isProcessing ? (
                                'Loading...'
                            ) : balanceStatus === 'unknown' ? (
                                // No confirmed or cached figure exists; showing 0 here would
                                // read as "your funds are gone" on a flaky connection.
                                <span data-testid="balance-unavailable" className="flex items-baseline">
                                    —
                                    <span className="ml-2 text-xs font-normal opacity-80">balance unavailable</span>
                                </span>
                            ) : (
                                <>
                                    {`${formatBalance(balance)} AVN`}
                                    {balanceStatus === 'stale' && (
                                        <span
                                            data-testid="balance-stale"
                                            className="ml-2 text-xs font-normal opacity-80"
                                            title="Shown from the last successful update; the server has not confirmed it yet"
                                        >
                                            last known
                                        </span>
                                    )}
                                    {processingProgress.isProcessing && (
                                        <Loader className="w-4 h-4 md:w-5 md:h-5 ml-2 animate-spin opacity-70" />
                                    )}
                                </>
                            )}
                        </div>
                        <div className="text-xs md:text-sm font-mono flex items-center space-x-1 text-white/90">
                            <span className="truncate max-w-[180px] sm:max-w-[220px] md:max-w-[300px]">
                                {address ? address : 'No wallet loaded'}
                            </span>
                            {address && (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleCopyAddress(address);
                                    }}
                                    className="p-1 text-white/90 hover:text-white rounded hover:bg-white/10 transition-colors flex-shrink-0"
                                    title="Copy address to clipboard"
                                >
                                    <Copy
                                        size={14}
                                        className={`md:w-4 md:h-4 ${copiedAddress === address ? 'text-green-300' : ''}`}
                                    />
                                </button>
                            )}
                        </div>
                        {processingProgress.isProcessing && (
                            <div className="text-xs mt-2 bg-white/20 p-2 rounded border border-white/30 text-white">
                                <div className="flex items-center flex-wrap">
                                    <Loader className="w-3 h-3 mr-1.5 animate-spin text-white flex-shrink-0" />
                                    <span className="font-medium text-white">
                                        Processing... {processingProgress.processed}/{processingProgress.total}
                                    </span>
                                </div>
                                {processingProgress.currentTx && (
                                    <div className="truncate mt-1 pl-4 text-white/80">
                                        TX: {processingProgress.currentTx.slice(0, 6)}...
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

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
                            className="flex-1 flex flex-col items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-background rounded-tl-lg text-gray-500 dark:text-gray-400 h-auto relative"
                        >
                            <Send className="h-4 w-4 mr-2" />
                            <span>Send</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="receive"
                            className="flex-1 flex  flex-col items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-background rounded-none text-gray-500 dark:text-gray-400 h-auto relative"
                        >
                            <QrCode className="h-4 w-4 mr-2" />
                            <span>Receive</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="history"
                            className="flex-1 flex flex-col items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-background rounded-br-lg rounded-tr-lg text-gray-500 dark:text-gray-400 h-auto relative"
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
                {/* Wallet Balance Card - Full Width */}
                <Card className="wallet-card relative bg-avian-600 mb-8">
                    <CardHeader className="py-3 px-4 relative z-10">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-xl text-white">Balance</CardTitle>
                            <Button
                                onClick={handleRefresh}
                                onMouseDown={handleRefreshMouseDown}
                                onMouseUp={handleRefreshMouseUp}
                                onMouseLeave={handleRefreshMouseUp}
                                onTouchStart={handleRefreshMouseDown}
                                onTouchEnd={handleRefreshMouseUp}
                                disabled={isRefreshing}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-white hover:text-white/80"
                                title="Refresh balance (hold for full refresh)"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="relative z-10">
                        <div className="text-2xl lg:text-3xl font-bold mb-2 flex items-center text-white">
                            {isLoading && !processingProgress.isProcessing ? (
                                'Loading...'
                            ) : balanceStatus === 'unknown' ? (
                                <span data-testid="balance-unavailable" className="flex items-baseline">
                                    —
                                    <span className="ml-2 text-xs font-normal opacity-80">balance unavailable</span>
                                </span>
                            ) : (
                                <>
                                    <span className="break-all whitespace-normal overflow-hidden">
                                        {`${formatBalance(balance)} AVN`}
                                    </span>
                                    {balanceStatus === 'stale' && (
                                        <span
                                            data-testid="balance-stale"
                                            className="ml-2 text-xs font-normal opacity-80"
                                            title="Shown from the last successful update; the server has not confirmed it yet"
                                        >
                                            last known
                                        </span>
                                    )}
                                    {processingProgress.isProcessing && (
                                        <Loader className="w-5 h-5 ml-2 flex-shrink-0 animate-spin opacity-70" />
                                    )}
                                </>
                            )}
                        </div>
                        <div className="text-sm font-mono flex items-center space-x-1 text-white/90">
                            <span className="truncate max-w-[300px]">
                                {address ? address : 'No wallet loaded'}
                            </span>
                            {address && (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleCopyAddress(address);
                                    }}
                                    className="p-1 text-white/90 hover:text-white rounded hover:bg-white/10 transition-colors flex-shrink-0"
                                    title="Copy address to clipboard"
                                >
                                    <Copy
                                        size={14}
                                        className={`w-4 h-4 ${copiedAddress === address ? 'text-green-300' : ''}`}
                                    />
                                </button>
                            )}
                        </div>
                        {processingProgress.isProcessing && (
                            <div className="text-xs mt-2 bg-white/20 p-2 rounded border border-white/30 text-white">
                                <div className="flex items-center flex-wrap">
                                    <Loader className="w-3 h-3 mr-1.5 animate-spin text-white flex-shrink-0" />
                                    <span className="font-medium text-white">
                                        Processing... {processingProgress.processed}/{processingProgress.total}
                                    </span>
                                </div>
                                {processingProgress.currentTx && (
                                    <div className="truncate mt-1 pl-4 text-white/80">
                                        TX: {processingProgress.currentTx.slice(0, 6)}...
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-12 gap-8">
                    {/* Send Panel - Left top */}
                    <div className="col-span-12 lg:col-span-6 xl:col-span-6">
                        <Card className="h-full rounded-none rounded-t-md">
                            <CardHeader className="py-3 px-4 bg-gradient-to-r from-avian-400 via-avian-700 to-avian-400 text-white flex items-center rounded-t-md">
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
                            <CardHeader className="py-3 px-4 bg-gradient-to-r from-avian-400 via-avian-700 to-avian-400 text-white flex items-center rounded-t-md">
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
                            <CardHeader className="py-3 px-4 bg-gradient-to-r from-avian-400 via-avian-700 to-avian-400 text-white flex items-center rounded-t-md">
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
                            <CardHeader className="py-3 px-4 bg-gradient-to-r from-avian-400 via-avian-700 to-avian-400 text-white flex items-center rounded-t-md">
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
