
import CryptoJS from 'crypto-js';

// Development Secret Key. 
// In a production environment, this should ideally be managed more securely,
// but for development, we are following the provided instructions.
const SECRET_KEY = 'vms-police-badulla-secret-2024';

/**
 * Encrypts a data string using AES.
 * @param data The data string to encrypt.
 * @returns The encrypted string in Base64 format.
 */
export function encryptQRData(data: string): string {
  try {
    return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return '';
  }
}

/**
 * Decrypts an AES-encrypted string.
 * @param encryptedData The encrypted string to decrypt.
 * @returns The decrypted data string.
 */
export function decryptQRData(encryptedData: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Formats information for a QR code.
 * @param cardId Human readable ID
 * @param divisionId Division reference
 * @returns A formatted, encrypted data string.
 */
export function generateQRPayload(cardId: string, divisionId: string): string {
  const rawData = `${cardId}|${divisionId}|verify-police-vms`;
  return encryptQRData(rawData);
}
