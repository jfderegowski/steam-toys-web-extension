// Calls the same endpoints the Steamworks Stats & Achievements page uses.
// Steamworks has no public API for defining achievements, so these mirror
// the requests the page sends when you click through it by hand.

const BASE = 'https://partner.steamgames.com';

/** Who may set the achievement, matching "Set By" on the partner site. */
export enum AchievementPermission {
  Client = 0,
  GameServer = 1,
  OfficialGameServer = 2,
}

/** One localized string: `{ english: "...", token: "NEW_ACHIEVEMENT_35_26_NAME" }`. */
export type LocalizedText = Record<string, string>;

export interface AchievementSave {
  statId: number;
  bitId: number;
  apiName: string;
  displayName: LocalizedText;
  description: LocalizedText;
  permission: AchievementPermission;
  hidden: boolean;
  /** API name of the stat that drives the progress bar, if any. */
  progressStat?: string;
  progressMin?: number;
  progressMax?: number;
}

/** "achievement" is the unlocked icon, "achievement_gray" the locked one. */
export type AchievementIconKind = 'achievement' | 'achievement_gray';

/** The partner site's CSRF token, sent with every write. */
export function getSessionId(): string {
  const match = document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/);
  if (!match) throw new Error('No sessionid cookie, are you logged in to Steamworks?');
  return decodeURIComponent(match[1]!);
}

/** App ID from the current page URL, e.g. /apps/achievements/4179640. */
export function getAppIdFromUrl(url = location.href): number {
  const match = url.match(/\/apps\/achievements\/(\d+)/);
  if (!match) throw new Error(`Not a Stats & Achievements page: ${url}`);
  return Number(match[1]!);
}

async function postForm(path: string, fields: Record<string, string | number | boolean>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
  body.append('sessionid', getSessionId());

  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
    body,
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** All stats of the app, as listed on the page. */
export async function fetchStats(appId: number) {
  const response = await fetch(`${BASE}/apps/fetchstats/${appId}`, {
    credentials: 'include',
    headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`fetchstats: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** One achievement, addressed by the stat and bit that hold it. */
export function fetchAchievement(appId: number, statId: number, bitId: number) {
  return postForm(`/apps/fetchachievement/${appId}/${statId}/${bitId}`, {});
}

/**
 * Creates an empty achievement slot. Steam packs achievements as bits of stats,
 * so it needs the highest stat and bit currently in use to pick the next one.
 */
export function newAchievement(appId: number, maxStatId: number, maxBitId: number) {
  return postForm(`/apps/newachievement/${appId}`, { maxstatid: maxStatId, maxbitid: maxBitId });
}

export function saveAchievement(appId: number, a: AchievementSave) {
  return postForm(`/apps/saveachievement/${appId}`, {
    statid: a.statId,
    bitid: a.bitId,
    apiname: a.apiName,
    displayname: JSON.stringify(a.displayName),
    description: JSON.stringify(a.description),
    permission: a.permission,
    hidden: a.hidden,
    progressStat: a.progressStat ?? '',
    progressMin: a.progressMin ?? '',
    progressMax: a.progressMax ?? '',
  });
}

/** The page posts this from a hidden iframe form, so the response is HTML, not JSON. */
export async function uploadAchievementIcon(
  appId: number,
  statId: number,
  bitId: number,
  kind: AchievementIconKind,
  image: Blob,
  fileName: string,
) {
  const form = new FormData();
  form.append('sessionid', getSessionId());
  form.append('MAX_FILE_SIZE', '3000000');
  form.append('appID', String(appId));
  form.append('statID', String(statId));
  form.append('bit', String(bitId));
  form.append('requestType', kind);
  form.append('image', image, fileName);

  const response = await fetch(`${BASE}/images/uploadachievement`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) throw new Error(`uploadachievement: HTTP ${response.status}`);
  return response.text();
}
