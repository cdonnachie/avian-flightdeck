'use client';

import { useState } from 'react';
import {
  X,
  Download,
  Upload,
  FileText,
  Database,
  Lock,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { BackupService } from '@/services/core/BackupService';
import { WalletBackup, RestoreOptions } from '@/types/backup';

// Import shadcn/ui components
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function BackupDrawer({ isOpen, onClose, onSuccess, onError }: BackupModalProps) {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [backupType, setBackupType] = useState<'full' | 'wallets'>('full');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [useEncryption, setUseEncryption] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [backupSummary, setBackupSummary] = useState<any>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');

  // Restore state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restoreOptions, setRestoreOptions] = useState<RestoreOptions>({
    includeWallets: true,
    includeAddressBook: true,
    includeSettings: true,
    overwriteExisting: false,
  });
  const [backupPreview, setBackupPreview] = useState<WalletBackup | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setRestorePassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowRestorePassword(false);
    setSelectedFile(null);
    setBackupPreview(null);
    setBackupSummary(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreateBackup = async () => {
    if (useEncryption && (!password || password !== confirmPassword)) {
      onError('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);

      let backup: WalletBackup;
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

      onSuccess(
        `${backupType === 'full' ? 'Full' : 'Wallets-only'} backup created and downloaded successfully!`,
      );
    } catch (error: any) {
      onError(error.message || 'Failed to create backup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    try {
      setIsLoading(true);

      // First, try to parse without password to check if it's encrypted
      const result = await BackupService.parseBackupFile(file);

      // Validate the backup
      if (!result.validation.isValid) {
        onError(`Invalid backup file: ${result.validation.errors.join(', ')}`);
        setSelectedFile(null);
        return;
      }

      setBackupPreview(result.backup);
    } catch (error: any) {
      // If parsing fails, it might be encrypted - we'll need password input
      if (
        error.message.includes('encrypted') ||
        error.message.includes('password') ||
        error.message.includes('decrypt')
      ) {
        // File is encrypted, show password field
        setBackupPreview(null);
      } else {
        onError(error.message || 'Failed to read backup file');
        setSelectedFile(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordVerify = async () => {
    if (!selectedFile || !restorePassword) return;

    try {
      setIsLoading(true);
      const result = await BackupService.parseBackupFile(selectedFile, restorePassword);

      if (!result.validation.isValid) {
        onError(`Invalid backup file: ${result.validation.errors.join(', ')}`);
        return;
      }

      setBackupPreview(result.backup);
    } catch (error: any) {
      onError(error.message || 'Failed to decrypt backup file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedFile || !backupPreview) {
      onError('Please select a valid backup file');
      return;
    }

    try {
      setIsLoading(true);

      await BackupService.restoreFromBackup(backupPreview, restoreOptions);

      onSuccess(`Backup restored successfully!`);

      // Suggest page reload
      if (
        confirm(
          'Backup restored successfully! Would you like to reload the page to see the changes?',
        )
      ) {
        window.location.reload();
      }
    } catch (error: any) {
      onError(error.message || 'Failed to restore backup');
    } finally {
      setIsLoading(false);
    }
  };

  // Content that will be displayed in both dialog and sheet
  const renderContent = () => (
    <div className="space-y-6 h-full flex flex-col">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'backup' | 'restore')}
        className="w-full border-b border-border"
      >
        <TabsList className="flex h-auto bg-transparent p-0 w-full">
          <TabsTrigger
            value="backup"
            className="flex-1 flex items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-transparent rounded-none text-muted-foreground h-auto relative"
          >
            <Download className="w-4 h-4 mr-2" />
            Create Backup
          </TabsTrigger>
          <TabsTrigger
            value="restore"
            className="flex-1 flex items-center justify-center px-6 py-4 data-[state=active]:border-b-1 data-[state=active]:border-avian-400 data-[state=active]:text-avian-400 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-avian-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:w-full bg-transparent rounded-none text-muted-foreground h-auto relative"
          >
            <Upload className="w-4 h-4 mr-2" />
            Restore Backup
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Content Container */}
      <div className={`overflow-y-auto ${isMobile ? 'p-4' : 'p-6'} flex-grow`}>
        {/* Backup Tab Content */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
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
                Recommended for security. You&apos;ll need this password to restore.
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
              disabled={isLoading || (useEncryption && (!password || password !== confirmPassword))}
              className="w-full"
            >
              {isLoading ? 'Creating Backup...' : 'Create & Download Backup'}
            </Button>
          </div>
        )}

        {activeTab === 'restore' && (
          <div className="space-y-6">
            {/* File Selection */}
            <div>
              <Label htmlFor="backupFile" className="block mb-2">
                Select Backup File
              </Label>
              <Input
                id="backupFile"
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
            </div>

            {/* Backup Preview */}
            {backupPreview && (
              <Card className="bg-primary/10 border-primary/30">
                <CardContent className="pt-6">
                  <div className="flex items-center mb-2">
                    <FileText className="w-4 h-4 mr-2 text-primary" />
                    <span className="font-medium text-primary">
                      Backup Preview
                    </span>
                  </div>
                  <div className="text-sm text-primary space-y-1">
                    <p>• Created: {new Date(backupPreview.timestamp).toLocaleDateString()}</p>
                    <p>• Version: {backupPreview.version}</p>
                    <p>• Wallets: {backupPreview.wallets.length}</p>
                    <p>• Address Book entries: {backupPreview.addressBook.length}</p>
                    <p>• Type: {backupPreview.metadata.backupType}</p>
                    {backupPreview.wallets.some((w) => w.isEncrypted) && (
                      <Alert className="mt-2 bg-caution/10 border-caution/30">
                        <AlertDescription className="text-caution text-xs">
                          ⚠️ This backup contains encrypted wallets. You&apos;ll need the individual
                          wallet passwords when accessing them.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Restore Password */}
            {selectedFile && !backupPreview && (
              <div>
                <Label htmlFor="restorePassword" className="block mb-2">
                  Backup Password
                </Label>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Input
                      id="restorePassword"
                      type={showRestorePassword ? "text" : "password"}
                      placeholder="Enter backup encryption password"
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowRestorePassword(!showRestorePassword)}
                    >
                      {showRestorePassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <Button onClick={handlePasswordVerify} disabled={isLoading || !restorePassword}>
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This backup file appears to be encrypted. Please enter the password to decrypt it.
                </p>
              </div>
            )}

            {/* Restore Options */}
            {backupPreview && (
              <div>
                <Label className="block mb-3">Restore Options</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeWallets"
                      checked={restoreOptions.includeWallets}
                      onCheckedChange={(checked) =>
                        setRestoreOptions((prev) => ({
                          ...prev,
                          includeWallets: checked as boolean,
                        }))
                      }
                    />
                    <Label htmlFor="includeWallets" className="cursor-pointer">
                      Restore wallets ({backupPreview.wallets.length})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeAddressBook"
                      checked={restoreOptions.includeAddressBook}
                      onCheckedChange={(checked) =>
                        setRestoreOptions((prev) => ({
                          ...prev,
                          includeAddressBook: checked as boolean,
                        }))
                      }
                    />
                    <Label htmlFor="includeAddressBook" className="cursor-pointer">
                      Restore address book ({backupPreview.addressBook.length})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeSettings"
                      checked={restoreOptions.includeSettings}
                      onCheckedChange={(checked) =>
                        setRestoreOptions((prev) => ({
                          ...prev,
                          includeSettings: checked as boolean,
                        }))
                      }
                    />
                    <Label htmlFor="includeSettings" className="cursor-pointer">
                      Restore settings
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="overwriteExisting"
                      checked={restoreOptions.overwriteExisting}
                      onCheckedChange={(checked) =>
                        setRestoreOptions((prev) => ({
                          ...prev,
                          overwriteExisting: checked as boolean,
                        }))
                      }
                    />
                    <Label htmlFor="overwriteExisting" className="cursor-pointer">
                      Overwrite existing data
                    </Label>
                  </div>
                </div>
                <Alert className="mt-2 bg-caution/10 border-caution/30">
                  <div className="flex items-start">
                    <AlertCircle className="w-4 h-4 mr-2 text-caution mt-0.5" />
                    <AlertDescription className="text-xs text-caution">
                      <p className="font-medium">Warning:</p>
                      <p>
                        If &quot;Overwrite existing&quot; is checked, this will replace your current
                        data. Otherwise, it will be merged with existing data.
                      </p>
                    </AlertDescription>
                  </div>
                </Alert>
              </div>
            )}

            {/* Restore Button */}
            <Button onClick={handleRestore} disabled={!backupPreview} className="w-full">
              {isLoading ? 'Restoring...' : 'Restore from Backup'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Render either a Sheet (mobile) or Dialog (desktop)
  return isMobile ? (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="p-0 flex flex-col h-full w-full sm:max-w-full" side="bottom">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>Backup & Restore</SheetTitle>
        </SheetHeader>
        {renderContent()}
        <SheetFooter className="px-4 py-3 border-t flex justify-end">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <Card className="w-full border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Backup & Restore</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">{renderContent()}</CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
