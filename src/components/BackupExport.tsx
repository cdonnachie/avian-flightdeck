'use client';

import React, { useState } from 'react';
import { Download, Database, FileText, Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BackupService } from '@/services/core/BackupService';
import { toast } from 'sonner';

export function BackupExport() {
    const [backupType, setBackupType] = useState<'full' | 'wallets'>('full');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [useEncryption, setUseEncryption] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [backupSummary, setBackupSummary] = useState<any>(null);

    const handleCreateBackup = async () => {
        if (useEncryption && (!password || password !== confirmPassword)) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            setIsExporting(true);

            let backup;
            if (backupType === 'full') {
                backup = await BackupService.createFullBackup(useEncryption ? password : undefined);
            } else {
                backup = await BackupService.createWalletsOnlyBackup(useEncryption ? password : undefined);
            }

            // Get backup summary for user
            const summary = BackupService.getBackupSummary(backup);
            setBackupSummary(summary);

            // Export and download the backup file
            const exportedBackup = await BackupService.exportBackup(
                backup,
                useEncryption ? password : undefined,
            );
            const filename = `avian-wallet-backup-${backupType}-${new Date().toISOString().split('T')[0]}.json`;
            BackupService.downloadBackup(exportedBackup, filename);

            toast.success(`${backupType === 'full' ? 'Full' : 'Wallets-only'} backup created and downloaded successfully!`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to create backup');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" />
                    Export Backup
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Backup Type Selection */}
                <div>
                    <Label className="block mb-3">Backup Type</Label>
                    <RadioGroup
                        value={backupType}
                        onValueChange={(value) => setBackupType(value as 'full' | 'wallets')}
                        className="space-y-2"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="full" id="full" />
                            <Label htmlFor="full" className="flex items-center cursor-pointer">
                                <Database className="w-4 h-4 mr-2 text-primary" />
                                <div>
                                    <span className="font-medium">Full Backup</span>
                                    <p className="text-xs text-muted-foreground">
                                        Wallets, address book, and settings
                                    </p>
                                </div>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="wallets" id="wallets" />
                            <Label htmlFor="wallets" className="flex items-center cursor-pointer">
                                <FileText className="w-4 h-4 mr-2 text-primary" />
                                <div>
                                    <span className="font-medium">Wallets Only</span>
                                    <p className="text-xs text-muted-foreground">
                                        Only wallet data (keys and addresses)
                                    </p>
                                </div>
                            </Label>
                        </div>
                    </RadioGroup>
                </div>

                {/* Encryption Options */}
                <div>
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="encryption"
                            checked={useEncryption}
                            onCheckedChange={(checked) => setUseEncryption(checked as boolean)}
                        />
                        <Label htmlFor="encryption" className="flex items-center cursor-pointer">
                            <Lock className="w-4 h-4 mr-2 text-caution" />
                            <span className="font-medium">Encrypt backup file</span>
                        </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                        Recommended for security. You'll need this password to restore.
                    </p>
                </div>

                {/* Password Fields */}
                {useEncryption && (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="password">Backup Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Backup encryption password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder="Confirm password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Backup Summary */}
                {backupSummary && (
                    <Alert className="bg-primary/10 border-primary/30">
                        <div className="flex items-center mb-2">
                            <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                            <span className="font-medium text-primary">
                                Backup Created Successfully
                            </span>
                        </div>
                        <AlertDescription className="text-sm text-primary space-y-1">
                            <p>• {backupSummary.walletsCount} wallets backed up</p>
                            <p>• {backupSummary.addressesCount} address book entries backed up</p>
                            <p>• Type: {backupSummary.backupType}</p>
                            <p>• Encrypted wallets: {backupSummary.hasEncryptedWallets ? 'Yes' : 'No'}</p>
                            <p>• Date: {backupSummary.date}</p>
                        </AlertDescription>
                    </Alert>
                )}

                {/* Create Backup Button */}
                <Button
                    onClick={handleCreateBackup}
                    disabled={isExporting || (useEncryption && (!password || password !== confirmPassword))}
                    className="w-full"
                >
                    {isExporting ? 'Creating Backup...' : 'Create & Download Backup'}
                </Button>
            </CardContent>
        </Card>
    );
}
