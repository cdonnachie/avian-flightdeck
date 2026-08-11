'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRouter } from 'next/navigation';
import { ChevronUp, Plus, Settings, Copy, Check } from 'lucide-react';
import { minidenticon } from 'minidenticons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { StorageService } from '@/services/core/StorageService';

interface WalletData {
    id?: number;
    name: string;
    address: string;
    isActive: boolean;
    isEncrypted: boolean;
    balance?: number;
}

// Detect iOS Safari for compatibility adjustments
const isIOSSafari = () => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const webkit = /WebKit/.test(ua);
    const chrome = /CriOS|Chrome/.test(ua);
    return iOS && webkit && !chrome;
};

// Custom wallet avatar component with properly scaled minidenticon
const WalletAvatar = ({ name, address, size = 'lg' }: { name: string; address: string; size?: 'sm' | 'md' | 'lg' }) => {
    const [imageError, setImageError] = useState(false);
    const [canvasDataUrl, setCanvasDataUrl] = useState<string | null>(null);
    const isIOS = useMemo(() => isIOSSafari(), []);

    const sizeClasses = {
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-16 w-16',
    };

    const sizePx = {
        sm: 32,
        md: 40,
        lg: 64,
    };

    // Generate minidenticon with proper scaling for larger avatars
    const identiconSvg = useMemo(() => {
        try {
            // Use larger scale values for better visibility in large avatars
            const saturation = size === 'lg' ? 95 : 90;
            const lightness = size === 'lg' ? 45 : 50;
            return minidenticon(address, saturation, lightness);
        } catch (error) {
            // If minidenticon fails, return null to fallback to initials
            console.warn('Failed to generate minidenticon:', error);
            return null;
        }
    }, [address, size]);

    const fallbackInitials = useMemo(() => {
        return name
            .split(' ')
            .map((word: string) => word.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }, [name]);

    // Convert SVG string to data URL for better iOS compatibility
    const svgDataUrl = useMemo(() => {
        if (!identiconSvg || imageError || isIOS) return null;
        try {
            const encodedSvg = encodeURIComponent(identiconSvg);
            return `data:image/svg+xml,${encodedSvg}`;
        } catch (error) {
            console.warn('Failed to encode SVG:', error);
            return null;
        }
    }, [identiconSvg, imageError, isIOS]);

    // Generate canvas-based avatar as primary approach for iOS
    useEffect(() => {
        if (!identiconSvg || canvasDataUrl || (!isIOS && !imageError)) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dimension = sizePx[size];
        canvas.width = dimension;
        canvas.height = dimension;

        try {
            // Create an image from the SVG
            const img = new Image();
            img.onload = () => {
                try {
                    ctx.drawImage(img, 0, 0, dimension, dimension);
                    const dataUrl = canvas.toDataURL('image/png');
                    setCanvasDataUrl(dataUrl);
                } catch (canvasError) {
                    console.warn('Canvas toDataURL failed:', canvasError);
                }
            };
            img.onerror = () => {
                console.warn('Failed to load SVG into canvas');
            };

            const encodedSvg = encodeURIComponent(identiconSvg);
            img.src = `data:image/svg+xml,${encodedSvg}`;
        } catch (error) {
            console.warn('Canvas avatar generation failed:', error);
        }
    }, [identiconSvg, size, canvasDataUrl, isIOS, imageError, sizePx]);

    return (
        <Avatar className={`${sizeClasses[size]} bg-muted/40 dark:bg-card flex-shrink-0`}>
            {!isIOS && svgDataUrl && !imageError ? (
                <img
                    src={svgDataUrl}
                    alt={`${name} avatar`}
                    className="w-full h-full object-cover rounded-full"
                    style={{
                        imageRendering: 'crisp-edges',
                    }}
                    onError={() => {
                        setImageError(true);
                    }}
                    onLoad={() => {
                        setImageError(false);
                    }}
                />
            ) : canvasDataUrl ? (
                <img
                    src={canvasDataUrl}
                    alt={`${name} avatar`}
                    className="w-full h-full object-cover rounded-full"
                    style={{
                        imageRendering: 'crisp-edges',
                    }}
                />
            ) : (
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {fallbackInitials}
                </AvatarFallback>
            )}
        </Avatar>
    );
};

// Format wallet address for display
const formatAddress = (address: string): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Format balance for display
const formatBalance = (balance: number): string => {
    const avnBalance = (balance / 100000000).toFixed(8);
    return `${parseFloat(avnBalance)} AVN`;
};

export function WalletSelector() {
    const { address, balance, reloadActiveWallet } = useWallet();
    const router = useRouter();
    const [wallets, setWallets] = useState<WalletData[]>([]);
    const [currentWallet, setCurrentWallet] = useState<WalletData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    // Load all wallets
    const loadWallets = async () => {
        try {
            const allWallets = await StorageService.getAllWallets();
            const walletsWithBalance = allWallets.map(wallet => ({
                ...wallet,
                balance: wallet.address === address ? balance : undefined
            }));
            setWallets(walletsWithBalance);

            // Find current active wallet
            const active = walletsWithBalance.find(w => w.isActive);
            setCurrentWallet(active || null);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to load wallets:', error);
        }
    };

    useEffect(() => {
        loadWallets();
    }, [address, balance]);

    // Listen for wallet events to keep the selector in sync
    useEffect(() => {
        const handleWalletSwitched = () => {
            loadWallets();
        };

        const handleWalletCreated = () => {
            loadWallets();
        };

        const handleWalletDeleted = () => {
            loadWallets();
        };

        const handleWalletImported = () => {
            loadWallets();
        };

        const handleWalletNameUpdated = () => {
            loadWallets();
        };

        window.addEventListener('wallet-switched', handleWalletSwitched);
        window.addEventListener('wallet-created', handleWalletCreated);
        window.addEventListener('wallet-deleted', handleWalletDeleted);
        window.addEventListener('wallet-imported', handleWalletImported);
        window.addEventListener('wallet-name-updated', handleWalletNameUpdated);

        return () => {
            window.removeEventListener('wallet-switched', handleWalletSwitched);
            window.removeEventListener('wallet-created', handleWalletCreated);
            window.removeEventListener('wallet-deleted', handleWalletDeleted);
            window.removeEventListener('wallet-imported', handleWalletImported);
            window.removeEventListener('wallet-name-updated', handleWalletNameUpdated);
        };
    }, []);

    // Handle wallet switching
    const handleSwitchWallet = async (walletId: number) => {
        if (!walletId) return;

        try {
            setIsLoading(true);
            const success = await StorageService.switchToWallet(walletId);

            if (success) {
                // Reload wallet context first
                await reloadActiveWallet();

                // Wait a moment for context to update
                await new Promise(resolve => setTimeout(resolve, 100));

                // Reload local wallet list
                await loadWallets();

                // Dispatch event to notify other components that wallet was switched
                window.dispatchEvent(new CustomEvent('wallet-switched', {
                    detail: { walletId }
                }));

                toast.success('Wallet switched successfully');
            }
        } catch (error) {
            toast.error('Failed to switch wallet', {
                description: error instanceof Error ? error.message : 'Unknown error occurred',
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Handle copy address
    const handleCopyAddress = async (walletAddress: string) => {
        try {
            await navigator.clipboard.writeText(walletAddress);
            setCopiedAddress(walletAddress);
            toast.success('Address copied to clipboard');

            // Reset copied state after 2 seconds
            setTimeout(() => {
                setCopiedAddress(null);
            }, 2000);
        } catch (error) {
            toast.error('Failed to copy address');
        }
    };

    // Handle manage wallets
    const handleManageWallets = () => {
        router.push('/settings/wallet?section=wallets');
    };

    if (!currentWallet) {
        return (
            <div className="p-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManageWallets}
                    className="w-full justify-start gap-3 p-3"
                >
                    <Plus className="w-5 h-5" />
                    <span className="font-semibold">Add Wallet</span>
                </Button>
            </div>
        );
    }

    return (
        <div className="p-1">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between h-auto p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        disabled={isLoading}
                    >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <WalletAvatar
                                name={currentWallet.name}
                                address={currentWallet.address}
                                size="lg"
                            />
                            <div className="flex flex-col items-start min-w-0 flex-1 text-left">
                                <span className="text-sm font-semibold text-sidebar-foreground truncate w-full text-left">
                                    {currentWallet.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatAddress(currentWallet.address)}
                                </span>
                                {currentWallet.balance !== undefined && (
                                    <span className="text-xs text-muted-foreground">
                                        {formatBalance(currentWallet.balance)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <ChevronUp className="h-4 w-4 flex-shrink-0" />
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    align="end"
                    side="top"
                    className="w-96"
                    sideOffset={8}
                >
                    {/* Current Wallet Header */}
                    <div className="px-2 py-1.5 text-sm text-left font-medium text-muted-foreground">
                        Current Wallet
                    </div>

                    {/* Current Wallet with Copy */}
                    <DropdownMenuItem
                        className="flex items-center gap-3 p-3 cursor-pointer"
                        onClick={() => handleCopyAddress(currentWallet.address)}
                    >
                        <WalletAvatar
                            name={currentWallet.name}
                            address={currentWallet.address}
                            size="lg"
                        />
                        <div className="flex flex-col items-start min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate w-full">
                                {currentWallet.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {currentWallet.address}
                            </span>
                            {currentWallet.balance !== undefined && (
                                <span className="text-xs text-primary font-medium">
                                    {formatBalance(currentWallet.balance)}
                                </span>
                            )}
                        </div>
                        {copiedAddress === currentWallet.address ? (
                            <Check className="w-4 h-4 text-primary" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                    </DropdownMenuItem>

                    {/* Other Wallets */}
                    {wallets.filter(w => !w.isActive).length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                                Switch Wallet
                            </div>
                            {wallets
                                .filter(wallet => !wallet.isActive)
                                .map((wallet) => (
                                    <DropdownMenuItem
                                        key={wallet.id}
                                        className="flex items-center gap-3 p-3 cursor-pointer"
                                        onClick={() => wallet.id && handleSwitchWallet(wallet.id)}
                                    >
                                        <WalletAvatar
                                            name={wallet.name}
                                            address={wallet.address}
                                            size="lg"
                                        />
                                        <div className="flex flex-col items-start min-w-0 flex-1">
                                            <span className="text-sm font-semibold truncate w-full">
                                                {wallet.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatAddress(wallet.address)}
                                            </span>
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                        </>
                    )}

                    {/* Actions */}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="flex items-center gap-2 p-2 cursor-pointer"
                        onClick={handleManageWallets}
                    >
                        <Settings className="w-4 h-4" />
                        <span>Manage Wallets</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
