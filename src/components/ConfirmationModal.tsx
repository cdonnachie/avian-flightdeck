'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  warningText?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  warningText,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
}: ConfirmationModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const renderContent = () => (
    <>
      {warningText && (
        <Alert
          variant={isDestructive ? 'destructive' : 'default'}
          className={`my-2 ${isDestructive ? '' : 'border-caution/30 text-caution'}`}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{warningText}</AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground">{message}</p>

      <div className="flex sm:justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose} className="sm:w-auto flex-1 sm:flex-initial">
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          variant={isDestructive ? 'destructive' : 'default'}
          className="sm:w-auto flex-1 sm:flex-initial"
        >
          {confirmText}
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center">
              <AlertTriangle
                className={`w-5 h-5 mr-2 ${isDestructive ? 'text-destructive' : 'text-warning'}`}
              />
              {title}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">{renderContent()}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <AlertTriangle
              className={`w-5 h-5 mr-2 ${isDestructive ? 'text-destructive' : 'text-warning'}`}
            />
            {title}
          </DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
