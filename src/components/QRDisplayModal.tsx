'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, Download, X } from 'lucide-react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

interface QRDisplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  label?: string;
}

export default function QRDisplayModal({ isOpen, onClose, address, label }: QRDisplayModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const generateQRCode = useCallback(async () => {
    try {
      setLoading(true);
      // Create avian: URI with address and optional label
      let uri = `avian:${address}`;
      if (label) {
        uri += `?label=${encodeURIComponent(label)}`;
      }

      const qrCode = await QRCode.toDataURL(uri, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrDataUrl(qrCode);
    } catch (error) {
      toast.error('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  }, [address, label]);

  useEffect(() => {
    if (isOpen && address) {
      generateQRCode();
    }
  }, [isOpen, address, generateQRCode]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Address copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy address');
    }
  };

  const downloadQRCode = () => {
    if (!qrDataUrl) return;

    const link = document.createElement('a');
    link.download = `avian-address-${address.slice(0, 8)}.png`;
    link.href = qrDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const ContentComponent = () => (
    <div className="text-center">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-avian-600"></div>
        </div>
      ) : (
        <>
          {qrDataUrl && (
            <div className="mb-4">
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="mx-auto rounded-lg shadow-lg"
                style={{ maxWidth: '300px', width: '100%' }}
              />
            </div>
          )}

          {label && (
            <div className="mb-2 text-sm font-medium text-muted-foreground">{label}</div>
          )}

          <div className="mb-4 p-3 bg-muted/40 dark:bg-card rounded-lg">
            <div className="text-xs font-mono text-muted-foreground break-all">
              {address}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyAddress}
              className="flex-1 flex items-center justify-center py-2 px-3 text-sm bg-muted/40 dark:bg-card hover:bg-muted/40 dark:hover:bg-card text-muted-foreground rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy
            </button>
            <button
              onClick={downloadQRCode}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center py-2 px-3 text-sm bg-avian-600 hover:bg-avian-700 disabled:bg-card text-white rounded-lg transition-colors"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share Address</DialogTitle>
          </DialogHeader>
          <ContentComponent />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Share Address</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4">
          <ContentComponent />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
