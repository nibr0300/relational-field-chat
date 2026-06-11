export const ARCHIVE_OWNER_EMAIL = "visiontruthdesign@gmail.com";

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? null;
}

export function isArchiveOwnerEmail(email?: string | null) {
  return normalizeEmail(email) === ARCHIVE_OWNER_EMAIL;
}

export function ownerMismatchMessage(email?: string | null) {
  const active = email ? `Aktiv backend-session är ${email}.` : "Ingen giltig backend-session hittades.";
  return `${active} Logga in med ${ARCHIVE_OWNER_EMAIL} för att nå historiken.`;
}