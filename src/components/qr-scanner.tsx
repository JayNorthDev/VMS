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
  const isStopping = useRef(false);
  const isInitializing = useRef(false);

  useEffect(() => {
    if (!isActive || isInitializing.current) return;
    isInitializing.current = true;

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
      } finally {
        isInitializing.current = false;
      }
    };

    startScanner();

    return () => {
      const stopAndClear = async () => {
        if (isStopping.current) return;
        isStopping.current = true;

        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop();
            }
          } catch (err) {
            console.warn('Scanner stop warning:', err);
          }

          try {
            // Important: clear internal state
            scannerRef.current.clear();
          } catch (err) {
            console.warn('Scanner clear warning:', err);
          } finally {
            scannerRef.current = null;
            isStopping.current = false;
            
            // Explicitly clear DOM to prevent duplicates in Strict Mode
            const el = document.getElementById(regionId);
            if (el) {
              el.innerHTML = "";
            }
          }
        }
      };
      stopAndClear();
    };
  }, [isActive, onScanSuccess, onScanError]);

  if (!isActive) return null;

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-muted bg-black/5">
      <div id={regionId} className="w-full" />
    </div>
  );
}
