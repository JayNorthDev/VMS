import { Division } from './types';

/**
 * Generates a clean, English-only prefix for the division.
 * Handles station names with numeric suffixes (e.g., "District 01" -> "1").
 */
export function getPrefix(name: string) {
  return name.split(/[\s,]+/)
    .map(word => {
      // Look for numbers first (handle 01, 02 etc)
      const numbers = word.match(/\d+/)?.[0]?.replace(/^0+/, '');
      if (numbers) return numbers;
      // Otherwise take the first letter of alphabetic words
      const firstLetter = word.match(/[a-zA-Z]/)?.[0];
      return firstLetter || '';
    })
    .join('')
    .toUpperCase();
}

export const divisionData: Division[] = [
    { id: "1", en: "Superintendent of Police Office", si: "පොලිස් අධිකාරී කාර්යාලය", color: "#2563EB", text: "#FFFFFF", max: 20 },
    { id: "2", en: "ASP Office, Badulla Dist 01", si: "සහකාර පොලිස් අධිකාරී කාර්යාලය බදුල්ල 01", color: "#16A34A", text: "#FFFFFF", max: 20 },
    { id: "3", en: "ASP Office, Badulla Dist 02", si: "සහකාර පොලිස් අධිකාරී කාර්යාලය බදුල්ල 02", color: "#FACC15", text: "#000000", max: 20 },
    { id: "4", en: "Head Quarter Chief Inspector", si: "මූලස්ථාන ප්‍රධාන පොලිස් පරීක්ෂක", color: "#8B4513", text: "#FFFFFF", max: 20 },
    { id: "5", en: "Administration Branch", si: "පාලන අංශය", color: "#FFFFFF", text: "#000000", max: 20, border: "border-gray-300" },
    { id: "6", en: "Crime Detection Branch", si: "අපරාධ විමර්ශණ අංශය", color: "#DC2626", text: "#FFFFFF", max: 20 },
    { id: "7", en: "Miscellaneous Complaints Branch", si: "විවිධ පැමිණිලි අංශය", color: "#9333EA", text: "#FFFFFF", max: 60 },
    { id: "8", en: "Traffic Branch", si: "රථ වාහන අංශය", color: "#86EFAC", text: "#000000", max: 30 },
    { id: "9", en: "Vice Branch", si: "දූෂණ මර්දන අංශය", color: "#6B7280", text: "#FFFFFF", max: 20 },
    { id: "10", en: "Charge Room", si: "උපසේවක / චාජ් රූම්", color: "#F97316", text: "#FFFFFF", max: 30 },
    { id: "11", en: "Woman and Child Abuse Prevention Bureau", si: "ළමා හා කාන්තා අපයෝජන නිවාරණ කාර්යාංශය", color: "#EC4899", text: "#FFFFFF", max: 20 },
    { id: "12", en: "Divisional Traffic Branch", si: "කොට්ඨාස රථ වාහන අංශය", color: "#32CD32", text: "#000000", max: 10 },
    { id: "13", en: "Divisional Crime Detective Bureau", si: "කොට්ඨාස අපරාධ විමර්ශණ කාර්යාංශය", color: "#C0C0C0", text: "#000000", max: 20 },
    { id: "14", en: "Divisional Child and Women's Bureau", si: "කොට්ඨාස ළමා හා කාන්තා කාර්යාංශය", color: "#FDA4AF", text: "#000000", max: 10 }
];
