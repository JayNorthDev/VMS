
'use client';

import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  isActive?: boolean;
}

export function QRScanner({ onScanSuccess, onScanError, isActive = true }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScanSuccess(decodedText);
      },
      (error) => {
        if (onScanError) onScanError(error);
      }
    );

    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((error) => {
          // Ignore clear errors on unmount
        });
      }
    };
  }, [isActive, onScanSuccess, onScanError]);

  if (!isActive) return null;

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-muted bg-black/5">
      <div id="qr-reader" className="w-full" />
    </div>
  );
}
