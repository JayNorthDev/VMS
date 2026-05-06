'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  isActive?: boolean;
}

export function QRScanner({ onScanSuccess, onScanError, isActive = true }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = 'qr-reader';

  useEffect(() => {
    if (!isActive) return;

    const html5QrCode = new Html5Qrcode(regionId);
    scannerRef.current = html5QrCode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        onScanSuccess(decodedText);
      },
      (errorMessage) => {
        if (onScanError) onScanError(errorMessage);
      }
    ).catch((err) => {
      console.error('Failed to start scanner:', err);
    });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch((err) => {
          console.error('Failed to stop scanner:', err);
        });
      }
    };
  }, [isActive, onScanSuccess, onScanError]);

  if (!isActive) return null;

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-muted bg-black/5">
      <div id={regionId} className="w-full" />
    </div>
  );
}
