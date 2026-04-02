import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

export const formatDate = (timestamp: Timestamp | Date | null) => {
  if (!timestamp) return '-';
  const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
  return format(date, 'd MMMM yyyy', { locale: th });
};

export const formatDateTime = (timestamp: Timestamp | Date | null) => {
  if (!timestamp) return '-';
  const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
  return format(date, 'd MMMM yyyy HH:mm', { locale: th });
};

export const formatInstructorName = (name: string) => {
  if (!name) return '';
  let cleanName = name.trim();
  
  // 1. Remove multiple "อ." prefixes first to simplify
  // This handles "อ.อ. Name" -> "อ. Name"
  cleanName = cleanName.replace(/^(อ\.\s*)+/, 'อ.').trim();

  // 2. Check if the name is English
  // We check if it contains English letters. If it does, we remove the "อ." prefix entirely.
  const hasEnglish = /[A-Za-z]/.test(cleanName);
  if (hasEnglish) {
    return cleanName.replace(/^อ\.\s*/, '').trim();
  }

  // 3. Handle Thai names
  // Remove "อ." prefix temporarily to check for other titles
  let nameWithoutO = cleanName.replace(/^อ\.\s*/, '').trim();

  // Regex for academic titles and military/police ranks
  const titleRegex = /^(ผศ\.|รศ\.|ดร\.|ศ\.|พล\.|พ\.|ร\.|น\.|จ\.|ส\.|ด\.ต\.|ว่าที่)/;
  
  if (titleRegex.test(nameWithoutO)) {
    // If it has a title, we return the name without the "อ." prefix
    return nameWithoutO;
  }
  
  // Remove common prefixes (นาย, นางสาว, นาง)
  const commonPrefixes = ['นาย', 'นางสาว', 'นาง'];
  let finalName = nameWithoutO;
  
  for (const prefix of commonPrefixes) {
    if (finalName.startsWith(prefix)) {
      finalName = finalName.substring(prefix.length).trim();
      break;
    }
  }

  return `อ.${finalName}`;
};

export const formatInstructorNameSplit = (name: string) => {
  const formatted = formatInstructorName(name);
  if (!formatted) return ['', ''];
  
  // Find the first space to split name and surname
  const spaceIndex = formatted.indexOf(' ');
  if (spaceIndex === -1) return [formatted, ''];
  
  return [
    formatted.substring(0, spaceIndex).trim(),
    formatted.substring(spaceIndex + 1).trim()
  ];
};
