'use client';

import { useState, useEffect } from 'react';
import { Book, User, QrCode } from 'lucide-react';
import AddressBookDrawer from './AddressBookDrawer';
import QRScannerModal from './QRScannerModal';
import { QRScanResult } from '@/types/addressBook';
import { toast } from 'sonner';

interface AddressBookButtonProps {
  onSelectAddress: (address: string) => void;
  onPaymentRequest?: (paymentData: QRScanResult) => void;
  currentAddress?: string;
  className?: string;
  showQRScanner?: boolean;
  variant?: 'button' | 'icon' | 'compact';
}

export default function AddressBookButton({
  onSelectAddress,
  onPaymentRequest,
  currentAddress,
  className = '',
  showQRScanner = true,
  variant = 'button',
}: AddressBookButtonProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleQRScan = (result: QRScanResult) => {
    // If we have payment request data (amount, label, message) and a callback, use it
    if (onPaymentRequest && (result.amount || result.label || result.message)) {
      onPaymentRequest(result);
      // Payment request toast will be handled by the payment request handler
    } else {
      // Otherwise, just set the address
      onSelectAddress(result.address);
      if (result.label) {
        toast.success(`📍 Address scanned: ${result.label}`);
      } else {
        toast.success('📍 Address scanned successfully');
      }
    }
  };

  const handleOpenDrawer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDrawer(true);
  };

  const handleOpenScanner = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowScanner(true);
  };

  if (variant === 'icon') {
    return (
      <>
        <div className="flex gap-2">
          <button
            onClick={handleOpenDrawer}
            className={`p-2 text-muted-foreground hover:text-avian-500 transition-colors ${className}`}
            title="Address Book"
            type="button"
          >
            <Book className="w-5 h-5" />
          </button>
          {showQRScanner && (
            <button
              onClick={handleOpenScanner}
              className={`p-2 text-muted-foreground hover:text-avian-500 transition-colors ${className}`}
              title="Scan QR Code"
              type="button"
            >
              <QrCode className="w-5 h-5" />
            </button>
          )}
        </div>

        <AddressBookDrawer
          isOpen={showDrawer}
          onClose={() => setShowDrawer(false)}
          onSelectAddress={onSelectAddress}
          currentAddress={currentAddress}
        />

        {showQRScanner && (
          <QRScannerModal
            isOpen={showScanner}
            onClose={() => setShowScanner(false)}
            onScan={handleQRScan}
          />
        )}
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <>
        <div className="flex gap-1">
          <button
            onClick={handleOpenDrawer}
            className={`px-2 py-1 text-xs bg-muted/40 dark:bg-card hover:bg-muted/40 dark:hover:bg-card text-muted-foreground rounded transition-colors ${className}`}
            type="button"
          >
            <Book className="w-3 h-3 inline mr-1" />
            Contacts
          </button>
          {showQRScanner && (
            <button
              onClick={handleOpenScanner}
              className={`px-2 py-1 text-xs bg-muted/40 dark:bg-card hover:bg-muted/40 dark:hover:bg-card text-muted-foreground rounded transition-colors ${className}`}
              type="button"
            >
              <QrCode className="w-3 h-3" />
            </button>
          )}
        </div>

        <AddressBookDrawer
          isOpen={showDrawer}
          onClose={() => setShowDrawer(false)}
          onSelectAddress={onSelectAddress}
          currentAddress={currentAddress}
        />

        {showQRScanner && (
          <QRScannerModal
            isOpen={showScanner}
            onClose={() => setShowScanner(false)}
            onScan={handleQRScan}
          />
        )}
      </>
    );
  }

  // Default button variant
  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={handleOpenDrawer}
          className={`flex items-center px-3 py-2 text-sm bg-avian-600 hover:bg-avian-700 text-white rounded-lg transition-colors ${className}`}
          type="button"
        >
          <User className="w-4 h-4 mr-2" />
          Address Book
        </button>
        {showQRScanner && (
          <button
            onClick={handleOpenScanner}
            className={`flex items-center px-3 py-2 text-sm bg-card hover:bg-card text-white rounded-lg transition-colors ${className}`}
            type="button"
          >
            <QrCode className="w-4 h-4 mr-2" />
            Scan QR
          </button>
        )}
      </div>

      <AddressBookDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        onSelectAddress={onSelectAddress}
        currentAddress={currentAddress}
      />

      {showQRScanner && (
        <QRScannerModal
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleQRScan}
        />
      )}
    </>
  );
}
