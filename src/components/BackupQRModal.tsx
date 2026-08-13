'use client';

import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import QRTransfer from '@/components/QRTransfer';

interface BackupQRModalProps {
  open: boolean;
  onClose: () => void;
  mode?: 'both' | 'restore-only';
  /** Called after a successful restore (the modal already closes first). e.g. navigate to the app. */
  onRestored?: () => void;
}

/**
 * Renders the QR wallet-transfer UI inline in a dialog (desktop) or drawer (mobile). Previously this
 * navigated to /backup/qr — which dropped onboarding users onto a full, logged-in-looking page.
 * Now the camera/scan/restore flow happens in place. QRTransfer is only mounted while open, so its
 * unmount cleanup stops the camera when the modal closes.
 */
export function BackupQRModal({ open, onClose, mode = 'both', onRestored }: BackupQRModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const handleRestored = () => {
    onClose();
    onRestored?.();
  };

  const transfer = open ? (
    <QRTransfer
      mode={mode}
      initialTab={mode === 'restore-only' ? 'restore' : 'backup'}
      onRestored={handleRestored}
    />
  ) : null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>QR Backup &amp; Restore</DialogTitle>
          </DialogHeader>
          {transfer}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[95vh]">
        <DrawerHeader className="border-b text-center">
          <DrawerTitle className="text-xl font-semibold">QR Backup &amp; Restore</DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">{transfer}</div>
      </DrawerContent>
    </Drawer>
  );
}
