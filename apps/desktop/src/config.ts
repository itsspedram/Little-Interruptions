export const APP_VERSION = "0.1.0";

/**
 * Where the app looks, once a day, for new messages. Point this at the folder
 * of the public repository that holds the packs, for example
 * "https://raw.githubusercontent.com/your-name/little-interruptions/main/packs/".
 *
 * Until it is changed, the update check is switched off.
 */
export const PACK_BASE_URL = "https://raw.githubusercontent.com/OWNER/REPO/main/packs/";

export function isUpdateSourceConfigured(): boolean {
  return PACK_BASE_URL.startsWith("https://") && !PACK_BASE_URL.includes("OWNER/REPO");
}
