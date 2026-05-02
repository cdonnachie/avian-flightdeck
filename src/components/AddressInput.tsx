'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import AddressBookButton from './AddressBookButton';
import { QRScanResult } from '@/types/addressBook';

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onPaymentRequest?: (paymentData: QRScanResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
}

export default function AddressInput({
  value,
  onChange,
  onPaymentRequest,
  placeholder = 'Enter Avian address (R... or avn1q...)',
  className = '',
  disabled = false,
  error = false,
}: AddressInputProps) {
  return (
    <div className="relative">
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`pr-20 font-mono ${error ? 'border-red-500' : ''} ${className}`}
        disabled={disabled}
      />
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
        <AddressBookButton
          onSelectAddress={onChange}
          onPaymentRequest={onPaymentRequest}
          currentAddress={value}
          variant="icon"
          showQRScanner={true}
        />
      </div>
    </div>
  );
}
