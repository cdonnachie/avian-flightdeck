'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { toast } from 'sonner';
import { StorageService } from '@/services/core/StorageService';
import {
    Copy,
    CheckCircle,
    Search,
    X,
    ExternalLink,
    Info,
    Wallet,
    ArrowDownLeft,
    ArrowUpRight,
    Banknote,
    Activity,
    Ban,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMediaQuery } from '@/hooks/use-media-query';

// Import shadcn components
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerFooter,
    DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface AddressWithBalance {
    path: string;
    address: string;
    balance: number;
    hasTransactions: boolean;
    publicKey?: string; // Optional public key field
}

// Address Details Dialog Component
const AddressDetailsDialog = ({
    isOpen,
    onClose,
    addressDetails,
    onCopy,
    coinType,
}: {
    isOpen: boolean;
    onClose: () => void;
    addressDetails: AddressWithBalance | null;
    onCopy: (address: string) => void;
    coinType: number;
}) => {
    const isMobile = useMediaQuery('(max-width: 640px)');

    if (!addressDetails) return null;

    const dialogContent = (
        <div className="space-y-6">
            {/* QR Code */}
            <div className="flex justify-center">
                <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100 dark:border-gray-600">
                    <QRCodeSVG
                        value={addressDetails.address}
                        size={isMobile ? 160 : 180}
                        className={isMobile ? '' : 'sm:size-[200px]'}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                        level="H"
                    />
                </div>
            </div>

            <div className="grid gap-4">
                {/* Address */}
                <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-600 dark:text-gray-300">Address</Label>
                    <div className="relative">
                        <div className="p-3 pr-10 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 font-mono text-sm break-all">
                            {addressDetails.address}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onCopy(addressDetails.address)}
                            className="absolute right-1.5 top-1.5 h-7 w-7 opacity-70 hover:opacity-100 bg-gray-100/50 dark:bg-gray-800/50 backdrop-blur-sm"
                            title="Copy address"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Balance */}
                <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-600 dark:text-gray-300">Balance</Label>
                    <div
                        className={`p-3 bg-gray-100 dark:bg-gray-800 rounded-md border ${addressDetails.balance > 0
                            ? 'border-emerald-300 dark:border-emerald-700'
                            : 'border-gray-200 dark:border-gray-700'
                            }`}
                    >
                        <span
                            className={`font-mono text-lg ${addressDetails.balance > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                                }`}
                        >
                            {addressDetails.balance > 0
                                ? (addressDetails.balance / 100000000).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 8,
                                })
                                : '0.00000000'}
                        </span>
                        <span className="ml-1.5 font-medium text-gray-600 dark:text-gray-400">AVN</span>
                    </div>
                </div>

                {/* Type & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Type */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-300">Type</Label>
                        <div>
                            {addressDetails.path.includes('(receiving)') ? (
                                <Badge className="px-3 py-1.5 bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700 font-medium">
                                    <ArrowDownLeft className="w-3.5 h-3.5 mr-1.5" />
                                    Receiving
                                </Badge>
                            ) : (
                                <Badge className="px-3 py-1.5 bg-indigo-200 dark:bg-indigo-800/60 text-indigo-900 dark:text-indigo-100 border-indigo-300 dark:border-indigo-700 font-medium">
                                    <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                                    Change
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Transaction History */}
                    <div className="space-y-1.5 mb-4">
                        <Label className="text-sm font-medium text-gray-600 dark:text-gray-300">Status</Label>
                        <div>
                            {addressDetails.hasTransactions ? (
                                <Badge className="px-3 py-1.5 bg-blue-200 dark:bg-blue-800/60 text-blue-900 dark:text-blue-100 border-blue-300 dark:border-blue-700 font-medium">
                                    <Activity className="w-3.5 h-3.5 mr-1.5" />
                                    Has Transactions
                                </Badge>
                            ) : (
                                <Badge
                                    variant="outline"
                                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-700 font-medium"
                                >
                                    <Ban className="w-3.5 h-3.5 mr-1.5" />
                                    No Transactions
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const actionButtons = (
        <div
            className={`flex ${isMobile ? 'flex-col' : 'flex-col-reverse sm:flex-row sm:justify-between'} gap-3`}
        >
            <div
                className={`flex ${isMobile ? 'flex-col' : 'flex-col sm:flex-row'} gap-3 ${isMobile ? 'w-full' : 'w-full sm:w-auto'}`}
            >
                <Button
                    variant="outline"
                    asChild
                    className={`${isMobile ? 'w-full' : 'w-full sm:w-auto'} text-avian-600 hover:text-avian-700 dark:text-avian-400 dark:hover:text-avian-300 border-avian-200 dark:border-avian-800`}
                >
                    <a
                        href={`https://flightpath.avn.network/address/${addressDetails.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2"
                    >
                        <ExternalLink className="w-4 h-4" />
                        <span>View on Explorer</span>
                    </a>
                </Button>
            </div>

            <Button onClick={onClose} className={isMobile ? 'w-full' : 'w-full sm:w-auto'}>
                Close
            </Button>
        </div>
    );

    if (isMobile) {
        return (
            <Drawer open={isOpen} onOpenChange={onClose}>
                <DrawerContent className="max-h-[95vh]">
                    <DrawerHeader className="text-center">
                        <DrawerTitle className="text-xl font-semibold flex items-center justify-center gap-2">
                            <Wallet className="w-5 h-5 text-avian-500" />
                            Address Details
                        </DrawerTitle>
                        <DrawerDescription className="text-xs font-mono opacity-70 pt-1">
                            {addressDetails.path}
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="px-4 overflow-y-auto">{dialogContent}</div>

                    <DrawerFooter className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        {actionButtons}
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()}>
            <DialogContent className="max-w-md max-h-[95vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-avian-500" />
                        Address Details
                    </DialogTitle>
                    <DialogDescription className="text-xs font-mono opacity-70 pt-1">
                        {addressDetails.path}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">{dialogContent}</div>

                <DialogFooter className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    {actionButtons}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const LoadingIndicator = ({ isLoading }: { isLoading: boolean }) => {
    if (!isLoading) return null;

    return (
        <Card className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800 mb-4">
            <CardContent className="flex items-center p-2">
                <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    ></circle>
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                </svg>
                <span>Loading addresses...</span>
            </CardContent>
        </Card>
    );
};

// Format BIP32 path to show relevant parts including coin type for verification
const formatPath = (path: string): string => {
    // For paths like m/44'/921'/0'/0/0 (external)
    // Show coin type and simplified path for debugging

    // Remove any surrounding text like "(external)" or "(internal)"
    const cleanPath = path.replace(/\s*\(.*\)\s*$/, '');

    // Split the path by /
    const parts = cleanPath.split('/');

    // If we have a proper BIP32 path, extract coin type and last 3 segments
    if (parts.length >= 5) {
        const coinType = parts[2].replace(/'/g, ''); // Extract coin type
        const accountIndex = parts[parts.length - 3].replace(/'/g, '');
        const change = parts[parts.length - 2];
        const addressIndex = parts[parts.length - 1];

        // Return format showing coin type for verification
        return `[${coinType}] ${accountIndex}/${change}/${addressIndex}`;
    }

    // Fallback to returning the original path
    return path;
};

// Check if an address is the main wallet address (0/0/0) for the current coin type
const isMainAddress = (path: string, currentCoinType: number): boolean => {
    // Remove any surrounding text like "(receiving)" or "(change)"
    const cleanPath = path.replace(/\s*\(.*\)\s*$/, '');

    // Split the path by /
    const parts = cleanPath.split('/');

    // If we have a proper BIP32 path, check if it's 0/0/0 with the current coin type
    if (parts.length >= 5) {
        const coinTypeFromPath = parts[2].replace(/'/g, ''); // Extract coin type from path
        const accountIndex = parts[parts.length - 3].replace(/'/g, '');
        const change = parts[parts.length - 2];
        const addressIndex = parts[parts.length - 1];

        return (
            coinTypeFromPath === currentCoinType.toString() &&
            accountIndex === '0' &&
            change === '0' &&
            addressIndex === '0'
        );
    }

    return false;
};
export default function DerivedAddressesPanel() {
    const {
        isConnected,
        deriveCurrentWalletAddresses,
        address: activeWalletAddress,
        wallet: activeWallet,
    } = useWallet();
    const { requireAuth } = useSecurity();
    const isMobile = useMediaQuery('(max-width: 640px)');

    // Account Index is always 0 (BIP44 standard)
    const accountIndex = 0;
    const [addressCount, setAddressCount] = useState<number>(5);
    // Initialize coin type from wallet's coin type, default to 921
    const [coinType, setCoinType] = useState<number>(921);
    const [walletCoinType, setWalletCoinType] = useState<number | null>(null);
    // Address type is read from the wallet (p2pkh / p2wpkh / p2sh-p2wpkh)
    const [walletAddressType, setWalletAddressType] = useState<string>('p2pkh');

    // Load address count preference on component mount
    useEffect(() => {
        const loadAddressCountPreference = async () => {
            try {
                const count = await StorageService.getChangeAddressCount();
                setAddressCount(count);
            } catch (error) {
                // Silently fall back to default value
            }
        };
        loadAddressCountPreference();
    }, []);

    // Load wallet's coin type when wallet changes
    useEffect(() => {
        const loadWalletCoinType = async () => {
            if (activeWalletAddress && activeWallet) {
                try {
                    const walletData = await activeWallet.getActiveWallet();
                    if (walletData?.coinType !== undefined) {
                        setWalletCoinType(walletData.coinType);
                        // If we haven't set a custom coin type yet, use the wallet's coin type
                        setCoinType(walletData.coinType);
                    } else {
                        // Legacy wallet without coin type stored, default to 921
                        setWalletCoinType(921);
                        setCoinType(921);
                    }
                    // Set address type from wallet data (defaults to p2pkh for legacy wallets)
                    setWalletAddressType(walletData?.addressType || 'p2pkh');
                } catch (error) {
                    // Silently fall back to default value
                    setWalletCoinType(921);
                    setCoinType(921);
                }
            } else {
                setWalletCoinType(null);
            }
        };
        loadWalletCoinType();
    }, [activeWalletAddress, activeWallet]);

    // Update address count preference when changed
    const handleAddressCountChange = async (newCount: number) => {
        try {
            await StorageService.setChangeAddressCount(newCount);
            setAddressCount(newCount);
            toast.success(`Address count updated to ${newCount}`);
        } catch (error) {
            toast.error('Failed to save address count preference');
        }
    };
    const [addresses, setAddresses] = useState<AddressWithBalance[]>([]);
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | 'with-balance' | 'receiving' | 'change'>(
        'all',
    );
    const [selectedAddress, setSelectedAddress] = useState<AddressWithBalance | null>(null);
    const [isAddressDetailsOpen, setIsAddressDetailsOpen] = useState<boolean>(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Function to open address details dialog - wrapped in useCallback
    const openAddressDetails = React.useCallback((address: AddressWithBalance) => {
        setSelectedAddress(address);
        setIsAddressDetailsOpen(true);
    }, []);

    // Function to close address details dialog - wrapped in useCallback
    const closeAddressDetails = React.useCallback(() => {
        setIsAddressDetailsOpen(false);
        // We can optionally delay clearing the selected address for transition effects
        setTimeout(() => {
            setSelectedAddress(null);
        }, 300);
    }, []);

    // Function to copy address to clipboard - wrapped in useCallback
    const handleCopyToClipboard = React.useCallback((address: string) => {
        navigator.clipboard.writeText(address);
        toast.success('Address copied to clipboard');
    }, []);

    const loadDerivedAddresses = async () => {
        // First check if we have an active wallet and it's HD-compatible
        if (!activeWalletAddress || !isHdWallet) {
            toast.error('Wallet Error', {
                description: 'No HD-compatible wallet is currently active',
            });
            return;
        }

        if (!isConnected) {
            toast.error('Connection Error', {
                description: 'Wallet is not connected to the network',
            });
            return;
        }

        setIsLoading(true);

        try {
            // Set isExpanded to true to show the panel when we have data
            setIsExpanded(true);

            // Use centralized authentication dialog with autoLogin to use stored password if available
            const authResult = await requireAuth('Please authenticate to view derived addresses', true);

            if (!authResult.success || !authResult.password) {
                // Authentication was canceled or failed in the dialog

                setIsLoading(false);
                return;
            }

            try {
                // Call method to derive receiving addresses (path index 0)
                const receivingAddresses = await deriveCurrentWalletAddresses(
                    authResult.password,
                    accountIndex,
                    addressCount,
                    walletAddressType, // Use wallet's actual address type (p2pkh/p2wpkh/p2sh-p2wpkh)
                    0, // Receiving addresses path
                    coinType, // Use selected coin type
                );

                // Call method to derive change addresses (path index 1)
                const changeAddresses = await deriveCurrentWalletAddresses(
                    authResult.password,
                    accountIndex,
                    addressCount,
                    walletAddressType, // Use wallet's actual address type (p2pkh/p2wpkh/p2sh-p2wpkh)
                    1, // Change addresses path
                    coinType, // Use selected coin type
                );

                // Add a label to each address type
                const labeledReceivingAddresses = receivingAddresses.map((addr) => ({
                    ...addr,
                    path: `${addr.path} (receiving)`,
                }));

                const labeledChangeAddresses = changeAddresses.map((addr) => ({
                    ...addr,
                    path: `${addr.path} (change)`,
                }));

                // Combine both types of addresses
                setAddresses([...labeledReceivingAddresses, ...labeledChangeAddresses]);

                toast.success('Addresses Loaded', {
                    description: `Successfully loaded ${receivingAddresses.length + changeAddresses.length} addresses`,
                });
            } catch (error: any) {
                // Handle specific errors from the deriveCurrentWalletAddresses function
                if (error.message && error.message.includes('Invalid password')) {
                    // Password validation would have happened in the AuthenticationDialog already
                    // This is a fallback in case validation was bypassed somehow
                    toast.error('Authentication Error', {
                        description: 'Invalid password provided. Please try again.',
                    });
                } else {
                    toast.error('Address Derivation Failed', {
                        description: error.message || 'Failed to discover addresses',
                    });
                }
            }
        } catch (err: any) {
            // This catches errors from requireAuth itself
            toast.error('Authentication Error', {
                description: err.message || 'Authentication process failed',
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Toggle panel expansion
    const toggleExpand = () => {
        // If we're expanding and don't have addresses yet, show the panel but don't auto-load
        // Let the user click the load button explicitly to avoid unexpected auth dialogs
        if (!isExpanded && addresses.length === 0) {
        } else if (!isExpanded && addresses.length > 0) {
        } else {
        }
        setIsExpanded(!isExpanded);
    };

    // No longer need manual password submission with the central auth dialog

    // Enhanced copy address to clipboard with visual feedback
    const copyAddressWithFeedback = (address: string) => {
        navigator.clipboard
            .writeText(address)
            .then(() => {
                setCopiedAddress(address);
                setTimeout(() => setCopiedAddress(null), 2000);

                // Show toast notification for better UX
                toast.success('Address Copied', {
                    description: 'Address copied to clipboard',
                });
            })
            .catch((err) => {
                toast.error('Copy Failed', {
                    description: 'Failed to copy address to clipboard',
                });
            });
    };

    // Refresh addresses when settings change
    const handleRefresh = () => {
        toast.info('Refreshing Addresses', {
            description: 'Loading derived addresses...',
        });
        loadDerivedAddresses();
    };

    // Filter addresses based on search term and active tab
    const filteredAddresses = addresses.filter((item) => {
        const matchesSearch =
            !searchTerm ||
            item.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.path.toLowerCase().includes(searchTerm.toLowerCase());

        if (activeTab === 'with-balance') {
            return matchesSearch && item.balance > 0;
        } else if (activeTab === 'receiving') {
            return matchesSearch && item.path.includes('(receiving)');
        } else if (activeTab === 'change') {
            return matchesSearch && item.path.includes('(change)');
        }

        return matchesSearch;
    });

    // Reset addresses when coin type changes (since different coin types generate different addresses)
    const previousCoinType = useRef<number>(coinType);
    useEffect(() => {
        if (previousCoinType.current !== coinType && addresses.length > 0) {
            setAddresses([]);
            toast.info('Coin Type Changed', {
                description:
                    'Addresses cleared. Click "Load Addresses" to generate addresses with the new coin type.',
            });
        }
        previousCoinType.current = coinType;
    }, [coinType, addresses.length]);

    // Track previous wallet address to detect actual wallet changes
    const previousWalletAddress = useRef<string | null>(activeWalletAddress);

    // Reset component state when the wallet changes
    useEffect(() => {
        // Only reset if the wallet address actually changed
        if (previousWalletAddress.current !== activeWalletAddress) {
            // Reset addresses and collapse panel when wallet changes
            setAddresses([]);
            setIsExpanded(false);
            setSearchTerm('');
            setCopiedAddress(null);
            setActiveTab('all');

            // Reset to default settings
            setAddressCount(5);
            // Reset coin type to new wallet's coin type when wallet changes
            // This will be set by the walletCoinType effect

            // If we're loading, stop
            if (isLoading) {
                setIsLoading(false);
            }

            // Update the ref to the new wallet address
            previousWalletAddress.current = activeWalletAddress;
        }
    }, [activeWalletAddress, isLoading]);

    // Track the wallet address at the time of opening the dialog
    const dialogWalletRef = useRef<string | null>(null);

    // Update the reference when dialog opens/closes
    useEffect(() => {
        if (isAddressDetailsOpen) {
            // Store the wallet address when dialog opens
            dialogWalletRef.current = activeWalletAddress;
        }
    }, [isAddressDetailsOpen, activeWalletAddress]);

    // Close dialog when wallet changes
    useEffect(() => {
        // Only run if we have a stored wallet address and the dialog is open
        if (
            dialogWalletRef.current &&
            isAddressDetailsOpen &&
            dialogWalletRef.current !== activeWalletAddress
        ) {
            closeAddressDetails();
        }
    }, [activeWalletAddress, closeAddressDetails, isAddressDetailsOpen]);

    // Focus search input when expanded
    useEffect(() => {
        if (isExpanded && searchInputRef.current && addresses.length > 0) {
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 100);
        }
    }, [isExpanded, addresses.length]);

    // State to track if the current wallet is HD-compatible
    const [isHdWallet, setIsHdWallet] = useState<boolean>(false);

    // Check if the current wallet is HD-compatible using StorageService
    useEffect(() => {
        const checkHdWalletCapability = async () => {
            // If there's no active wallet address or wallet service isn't available
            if (!activeWalletAddress || !activeWallet) {
                setIsHdWallet(false);
                return;
            }

            try {
                // Check if there's a stored mnemonic for this wallet
                const storedMnemonic = await StorageService.getMnemonic();

                // A wallet is HD-compatible if it has a stored mnemonic
                const hasHdCapabilities = !!storedMnemonic;

                setIsHdWallet(hasHdCapabilities);

                // If this wallet isn't HD-compatible and we have addresses loaded, reset them
                if (!hasHdCapabilities && addresses.length > 0) {
                    setAddresses([]);
                    setIsExpanded(false);
                }
            } catch (error) {
                setIsHdWallet(false);
            }
        };

        checkHdWalletCapability();
    }, [activeWalletAddress, activeWallet, addresses.length]);

    // If there's no wallet or the wallet isn't HD-compatible, either show nothing or a message
    if (!activeWalletAddress) {
        return null;
    }

    if (!isHdWallet) {
        return (
            <div
                className={`mt-4 rounded-lg shadow-md bg-white dark:bg-gray-800 ${isMobile ? 'p-4' : 'p-4'}`}
            >
                <div className="flex items-center justify-between">
                    <h2
                        className={`font-semibold text-gray-800 dark:text-gray-200 ${isMobile ? 'text-lg' : 'text-lg'}`}
                    >
                        HD Wallet Addresses
                    </h2>
                </div>
                <div
                    className={`mt-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-center ${isMobile ? 'p-3' : 'p-4'}`}
                >
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                        This wallet was not created with HD (hierarchical deterministic) capabilities.
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Only wallets created with a seed phrase support derived addresses.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <Card className="mt-4">
            <CardContent className={`pt-6 pb-6 ${isMobile ? 'px-4' : 'px-6'}`}>
                <div
                    className="flex mb-4 items-center justify-between cursor-pointer"
                    onClick={toggleExpand}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            toggleExpand();
                            e.preventDefault();
                        }
                    }}
                >
                    <h2 className={`font-semibold ${isMobile ? 'text-lg' : 'text-lg'}`}>
                        HD Wallet Addresses
                    </h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        >
                            <path
                                d="M6 9L12 15L18 9"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </Button>
                </div>

                {isExpanded && (
                    <div className="mt-4 space-y-4">
                        <LoadingIndicator isLoading={isLoading} />

                        {/* Show Load Addresses button when no addresses are loaded */}
                        {addresses.length === 0 && !isLoading && (
                            <div className="text-center py-6">
                                <Button
                                    onClick={loadDerivedAddresses}
                                    size="lg"
                                    className="bg-primary hover:bg-primary/90"
                                >
                                    Load Addresses
                                </Button>
                                <p className="text-sm text-muted-foreground mt-2">
                                    Click to authenticate and load your wallet's derived addresses
                                </p>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-3">
                                <Label htmlFor="addressCount"># of Addresses to Show</Label>
                                <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                                    <div className="flex-1">
                                        <Slider
                                            id="addressCount"
                                            min={1}
                                            max={20}
                                            step={1}
                                            value={[addressCount]}
                                            onValueChange={(value) => handleAddressCountChange(value[0])}
                                            className="mt-2"
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                            <span>1</span>
                                            <span className="font-medium text-primary">{addressCount}</span>
                                            <span>20</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                        <Badge className="bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                                            ×{addressCount}
                                        </Badge>
                                        <Badge className="bg-indigo-200 text-indigo-900 dark:bg-indigo-800 dark:text-indigo-100">
                                            ×{addressCount}
                                        </Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Shows both receiving and change addresses
                                </p>
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="coinType">Coin Type (BIP44)</Label>
                                <Select
                                    value={coinType.toString()}
                                    onValueChange={(value) => setCoinType(parseInt(value))}
                                    disabled
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="921">921 - Avian (Standard)</SelectItem>
                                        <SelectItem value="175">175 - Ravencoin (Legacy Compatibility)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    <p>
                                        This value is automatically determined by your wallet. Different coin types generate completely different addresses.
                                    </p>
                                    {coinType === 175 && (
                                        <p className="text-amber-600 dark:text-amber-400 font-medium">
                                            ⚠️ Using Ravencoin compatibility mode
                                        </p>
                                    )}
                                </div>
                            </div>
                            {addresses.length > 0 && (
                                <div className="mb-4">
                                    <Label htmlFor="searchTerm">Search Addresses</Label>
                                    <div className="relative mt-1">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            type="text"
                                            id="searchTerm"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9 pr-9"
                                            placeholder="Search by address or path"
                                            ref={searchInputRef}
                                        />
                                        {searchTerm && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSearchTerm('')}
                                                className="absolute right-1 top-1 h-8 w-8 p-0"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {addresses.length > 0 && (
                                <div className="mb-4">
                                    <Tabs
                                        value={activeTab}
                                        onValueChange={(val: string) =>
                                            setActiveTab(val as 'all' | 'receiving' | 'change' | 'with-balance')
                                        }
                                        className="w-full border-b border-gray-200 dark:border-gray-700"
                                    >
                                        <TabsList className="flex h-auto bg-transparent p-0 w-full">
                                            <TabsTrigger
                                                value="all"
                                                className={`flex-1 flex items-center justify-center ${isMobile ? 'px-2 py-3' : 'px-6 py-4'} data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-transparent rounded-none text-gray-500 dark:text-gray-400 h-auto relative`}
                                            >
                                                <Wallet className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                                                <span className={isMobile ? 'text-xs' : ''}>
                                                    {isMobile ? 'All' : 'All Addresses'}
                                                </span>
                                            </TabsTrigger>
                                            <TabsTrigger
                                                value="receiving"
                                                className={`flex-1 flex items-center justify-center ${isMobile ? 'px-2 py-3' : 'px-6 py-4'} data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-transparent rounded-none text-gray-500 dark:text-gray-400 h-auto relative`}
                                            >
                                                <ArrowDownLeft className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                                                <span className={isMobile ? 'text-xs' : ''}>
                                                    {isMobile ? 'Receive' : 'Receiving'}
                                                </span>
                                            </TabsTrigger>
                                            <TabsTrigger
                                                value="change"
                                                className={`flex-1 flex items-center justify-center ${isMobile ? 'px-2 py-3' : 'px-6 py-4'} data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-transparent rounded-none text-gray-500 dark:text-gray-400 h-auto relative`}
                                            >
                                                <ArrowUpRight className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                                                <span className={isMobile ? 'text-xs' : ''}>Change</span>
                                            </TabsTrigger>
                                            <TabsTrigger
                                                value="with-balance"
                                                className={`flex-1 flex items-center justify-center ${isMobile ? 'px-2 py-3' : 'px-6 py-4'} data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-transparent rounded-none text-gray-500 dark:text-gray-400 h-auto relative`}
                                            >
                                                <Banknote className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                                                <span className={isMobile ? 'text-xs' : ''}>
                                                    {isMobile ? 'Balance' : 'With Balance'}
                                                </span>
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </div>
                            )}
                            {addresses.length > 0 && (
                                <div className="flex justify-end mb-4">
                                    <Button onClick={handleRefresh} disabled={isLoading} className="flex items-center">
                                        <svg
                                            className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                        </svg>
                                        {isLoading ? 'Loading...' : 'Refresh'}
                                    </Button>
                                </div>
                            )}{' '}
                            {filteredAddresses.length > 0 && (
                                <div className="p-3 mb-4 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-md">
                                    <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-200">
                                        Legend
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Row indicators - Enhanced contrast */}
                                        <div className="space-y-2">
                                            <div className="flex items-center">
                                                <div className="w-5 h-5 bg-emerald-200 dark:bg-emerald-800/60 border border-emerald-300 dark:border-emerald-600 mr-3 rounded"></div>
                                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    Address with balance
                                                </span>
                                            </div>
                                            <div className="flex items-center">
                                                <div className="w-5 h-5 bg-blue-200 dark:bg-blue-800/60 border border-blue-300 dark:border-blue-600 mr-3 rounded"></div>
                                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    Address with transaction history
                                                </span>
                                            </div>
                                        </div>

                                        {/* Type indicators - Enhanced contrast */}
                                        <div className="space-y-2">
                                            <div className="flex items-center">
                                                <div className="w-5 h-5 border-l-4 border-amber-500 dark:border-amber-400 bg-amber-100/50 dark:bg-amber-900/30 mr-3 rounded"></div>
                                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    Receiving address (m/{walletAddressType === 'p2wpkh' ? 84 : walletAddressType === 'p2sh-p2wpkh' ? 49 : 44}&apos;/{coinType}&apos;/0&apos;/0/x)
                                                </span>
                                            </div>
                                            <div className="flex items-center">
                                                <div className="w-5 h-5 border-l-4 border-indigo-500 dark:border-indigo-400 bg-indigo-100/50 dark:bg-indigo-900/30 mr-3 rounded"></div>
                                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    Change address (m/{walletAddressType === 'p2wpkh' ? 84 : walletAddressType === 'p2sh-p2wpkh' ? 49 : 44}&apos;/{coinType}&apos;/0&apos;/1/x)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {filteredAddresses.length > 0 ? (
                    <div className="mt-2 sm:overflow-visible overflow-x-auto">
                        {/* Mobile hint */}
                        {isMobile && (
                            <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md sm:hidden">
                                <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center">
                                    <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                    Tap any row to view address details and actions
                                </p>
                            </div>
                        )}
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                            <thead className="bg-gray-50 dark:bg-gray-700 dark:bg-opacity-80">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-1/4">
                                        Details
                                    </th>
                                    {/* Address column - hidden on mobile */}
                                    <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">
                                        Address
                                    </th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-[120px]">
                                        Balance
                                    </th>
                                    {/* Actions column - hidden on mobile */}
                                    <th className="hidden sm:table-cell px-3 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-[140px]">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                {filteredAddresses.map((item, index) => {
                                    // Build comprehensive class string
                                    const baseClasses = isMobile
                                        ? 'transition-colors bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                                        : 'transition-colors bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700';

                                    // Background color classes based on balance/transaction status
                                    const backgroundClasses =
                                        item.balance > 0
                                            ? 'bg-emerald-200/60 dark:bg-emerald-800/40 hover:bg-emerald-200/80 dark:hover:bg-emerald-800/50'
                                            : item.hasTransactions && item.balance <= 0
                                                ? 'bg-blue-200/60 dark:bg-blue-800/40 hover:bg-blue-200/80 dark:hover:bg-blue-800/50'
                                                : '';

                                    // Border classes based on address type - ensure specificity
                                    const borderClasses = item.path.includes('(receiving)')
                                        ? '!border-l-4 !border-amber-500 dark:!border-amber-400'
                                        : item.path.includes('(change)')
                                            ? '!border-l-4 !border-indigo-500 dark:!border-indigo-400'
                                            : '';

                                    const rowClasses = [baseClasses, backgroundClasses, borderClasses]
                                        .filter(Boolean)
                                        .join(' ');

                                    return (
                                        <tr
                                            key={index}
                                            className={rowClasses}
                                            onClick={isMobile ? () => openAddressDetails(item) : undefined}
                                            style={{
                                                borderLeftWidth:
                                                    item.path.includes('(receiving)') || item.path.includes('(change)')
                                                        ? '4px'
                                                        : undefined,
                                                borderLeftColor: item.path.includes('(receiving)')
                                                    ? 'rgb(245 158 11)' // amber-500
                                                    : item.path.includes('(change)')
                                                        ? 'rgb(99 102 241)' // indigo-500
                                                        : undefined,
                                            }}
                                        >
                                            <td
                                                className="px-3 py-2 text-xs font-mono text-gray-700 dark:text-gray-300"
                                                title={item.path}
                                            >
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium whitespace-nowrap">
                                                        {formatPath(item.path)}
                                                    </span>

                                                    {item.path.includes('(receiving)') && (
                                                        <Badge
                                                            variant="outline"
                                                            className="bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700 font-medium whitespace-nowrap"
                                                        >
                                                            Receive
                                                        </Badge>
                                                    )}

                                                    {item.path.includes('(change)') && (
                                                        <Badge
                                                            variant="outline"
                                                            className="bg-indigo-200 dark:bg-indigo-800/60 text-indigo-900 dark:text-indigo-100 border-indigo-300 dark:border-indigo-700 font-medium whitespace-nowrap"
                                                        >
                                                            Change
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            {/* Address column - hidden on mobile */}
                                            <td className="hidden sm:table-cell px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
                                                <div className="flex items-center" title={item.address}>
                                                    <div className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded w-full max-w-full">
                                                        <span className="hidden sm:inline font-medium tracking-wide break-all">
                                                            {item.address}
                                                        </span>
                                                        <span className="sm:hidden font-medium tracking-wide">
                                                            {item.address.substring(0, 6)}
                                                            <span className="text-gray-400 dark:text-gray-500 px-1">...</span>
                                                            {item.address.substring(item.address.length - 6)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {item.balance > 0 ? (
                                                    <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors">
                                                        {(item.balance / 100000000).toFixed(8)} AVN
                                                    </Badge>
                                                ) : item.hasTransactions ? (
                                                    <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors">
                                                        0 AVN
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                    >
                                                        0 AVN
                                                    </Badge>
                                                )}
                                            </td>
                                            {/* Actions column - hidden on mobile */}
                                            <td className="hidden sm:table-cell px-3 py-2 text-center">
                                                <div className="flex justify-center space-x-3">
                                                    <Button
                                                        onClick={() => openAddressDetails(item)}
                                                        size="icon"
                                                        variant="ghost"
                                                        className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 group relative transition-colors h-8 w-8"
                                                        aria-label="View address details"
                                                    >
                                                        <Info className="w-4 h-4" />
                                                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity shadow-lg">
                                                            View Details
                                                        </span>
                                                    </Button>

                                                    <Button
                                                        onClick={() => copyAddressWithFeedback(item.address)}
                                                        size="icon"
                                                        variant="ghost"
                                                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 group relative transition-colors h-8 w-8"
                                                        aria-label="Copy address to clipboard"
                                                    >
                                                        {copiedAddress === item.address ? (
                                                            <CheckCircle className="w-4 h-4 text-green-500" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity shadow-lg">
                                                            {copiedAddress === item.address ? 'Copied!' : 'Copy Address'}
                                                        </span>
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        asChild
                                                        className="text-avian-500 dark:text-avian-300 hover:text-avian-700 dark:hover:text-avian-200 group relative transition-colors h-8 w-8"
                                                    >
                                                        <a
                                                            href={`https://flightpath.avn.network/address/${item.address}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label="Open address in Avian Explorer (opens in new tab)"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity shadow-lg">
                                                                View on Explorer
                                                            </span>
                                                        </a>
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    !isLoading && (
                        <div className="p-6 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="rounded-full p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                                    <svg
                                        className="w-6 h-6"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                    </svg>
                                </div>
                                <h3 className="text-base font-medium text-gray-700 dark:text-gray-300">
                                    No Addresses Loaded
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                                    Click the button below to authenticate and load your wallet&apos;s derived
                                    addresses.
                                </p>
                                <Button
                                    onClick={loadDerivedAddresses}
                                    size="lg"
                                    className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 mt-2"
                                >
                                    <svg
                                        className="w-5 h-5 mr-2"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                    </svg>
                                    Load Addresses
                                </Button>
                            </div>
                        </div>
                    )
                )}

                {/* Address Details Dialog */}
                <AddressDetailsDialog
                    isOpen={isAddressDetailsOpen}
                    onClose={closeAddressDetails}
                    addressDetails={selectedAddress}
                    onCopy={handleCopyToClipboard}
                    coinType={coinType}
                />

            </CardContent>
        </Card>
    );
}
