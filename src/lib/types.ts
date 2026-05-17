
import { Timestamp } from "firebase/firestore";

export interface Division {
  id: string;
  en: string;
  si: string;
  color: string;
  text: string;
  max: number;
  border?: string;
}

export interface VisitorEntry {
  id?: string;
  fullName: string;
  identificationType: string;
  identificationNumber: string;
  address: string;
  gender: string;
  divisionId: string;
  checkInTime: Timestamp;
  status: 'IN' | 'OUT';
  checkOutTime?: Timestamp;
  outcome?: 'Completed' | 'Pending';
  divisionEnglishName?: string;
  divisionSinhalaName?: string;
  divisionBackgroundColorHex?: string;
  divisionTextColorHex?: string;
  duration?: string;
  allocatedCardId?: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Visitor Management';
  permissions: string[];
}

export interface AuditLog {
  id?: string;
  timestamp: Timestamp;
  userName: string;
  action: string;
  details: string;
}

export interface IDCard {
  id: string; // Firestore Document ID
  cardId: string; // Human-readable ID (e.g., SP-001)
  divisionId: string;
  qrCodeData: string; // Encrypted string
  status: 'available' | 'allocated' | 'lost';
  currentVisitorId?: string | null;
  currentLogId?: string | null;
  createdAt: Timestamp;
}
