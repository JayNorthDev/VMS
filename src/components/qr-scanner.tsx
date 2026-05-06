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

    // Initialize scanner instance
    const html5QrCode = new Html5Qrcode(regionId);
    scannerRef.current = html5QrCode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const startScanner = async () => {
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            onScanSuccess(decodedText);
          },
          (errorMessage) => {
            if (onScanError) onScanError(errorMessage);
          }
        );
      } catch (err) {
        console.error('Failed to start scanner:', err);
      }
    };

    startScanner();

    return () => {
      // Robust cleanup to prevent AbortError and DOM manipulation issues
      const cleanup = async () => {
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop();
            }
            // Clear the internal state of the library before the DOM node is removed by React
            scannerRef.current.clear();
          } catch (err) {
            // Silently handle cases where the scanner might have already been stopped
            console.warn('Scanner cleanup warning:', err);
          } finally {
            scannerRef.current = null;
          }
        }
      };
      cleanup();
    };
  }, [isActive, onScanSuccess, onScanError]);

  if (!isActive) return null;

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-muted bg-black/5">
      <div id={regionId} className="w-full" />
    </div>
  );
}
