// Calls the same endpoints the Steamworks Stats and Achievements pages use.
// Steamworks has no public API for defining them, so these mirror what the
// pages send; request and response shapes come from the partner site's
// public/javascript/apps.js (AppsAjaxRequest and its callers).

const BASE = 'https://partner.steamgames.com';

/** Who may set the value, matching "Set By" on the partner site. */
export enum Permission {
  Client = 0,
  GameServer = 1,
  OfficialGameServer = 2,
}

export type StatType = 'INT' | 'FLOAT' | 'AVGRATE';

/**
 * Localized strings keyed by Steam language ("english", "polish", ...) plus
 * "token", the localization token. A plain string means English only.
 */
export type LocalizedText = string | Record<string, string>;

/** A stat as returned by fetchstats / newstat / savestat. Optional fields are left out when unset. */
export interface StatInfo {
  stat_id: number;
  type: StatType;
  name: string;
  display: { name?: string };
  permission: number | string;
  incrementonly?: number | string;
  aggregated?: number | string;
  min?: string;
  max?: string;
  maxchange?: string;
  default?: string;
  windowsize?: string;
}

/** An achievement as returned by fetchachievements / newachievement / saveachievement. */
export interface AchievementInfo {
  stat_id: number;
  bit_id: number;
  api_name: string;
  display_name?: LocalizedText;
  description?: LocalizedText;
  permission: number | string;
  hidden: number | string | boolean;
  icon?: string;
  icon_gray?: string;
  /** Present only for achievements with a progress stat. */
  progress?: { min_val: string; max_val: string; value: { operand1: string } };
}

export interface StatSave {
  statId: number;
  type: StatType;
  apiName: string;
  displayName: string;
  permission: Permission;
  incrementOnly: boolean;
  aggregated: boolean;
  min?: number;
  max?: number;
  maxChange?: number;
  default?: number;
  /** AVGRATE only. */
  windowSize?: number;
}

export interface AchievementSave {
  statId: number;
  bitId: number;
  apiName: string;
  displayName: LocalizedText;
  description: LocalizedText;
  permission: Permission;
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

/** App ID from the current page URL, e.g. /apps/achievements/4179640 or /apps/stats/4179640. */
export function getAppIdFromUrl(url = location.href): number {
  const match = url.match(/\/apps\/(?:achievements|stats)\/(\d+)/);
  if (!match) throw new Error(`Not a Stats or Achievements page: ${url}`);
  return Number(match[1]!);
}

/**
 * Highest stat and bit IDs in use, which the "new" endpoints need to pick the next free ones.
 * The page keeps them in hidden spans; they go stale once we create anything, so callers track
 * them from the responses after reading them once.
 */
export function readMaxIdsFromPage(): { maxStatId: number; maxBitId: number } {
  const read = (id: string) => Number(document.getElementById(id)?.textContent ?? NaN);
  const maxStatId = read('max_statid_used');
  const maxBitId = read('max_bitid_used');
  if (Number.isNaN(maxStatId)) throw new Error('No #max_statid_used on this page.');
  return { maxStatId, maxBitId: Number.isNaN(maxBitId) ? 0 : maxBitId };
}

const AJAX_HEADERS = { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' };

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { credentials: 'include', headers: AJAX_HEADERS });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function post<T>(path: string, fields: Record<string, string | number | boolean>): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
  body.append('sessionid', getSessionId());

  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: AJAX_HEADERS,
    body,
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/** Optional numbers go out as empty strings, which the page sends for blank inputs. */
const optional = (value: number | undefined) => (value === undefined ? '' : value);

// ---- Stats ----

export function fetchStats(appId: number) {
  return get<StatInfo[]>(`/apps/fetchstats/${appId}`);
}

export function newStat(appId: number, maxStatId: number) {
  return post<{ maxstatid: number; stat: StatInfo }>(`/apps/newstat/${appId}`, { maxstatid: maxStatId });
}

export function saveStat(appId: number, s: StatSave) {
  return post<{ saved?: boolean; stat?: StatInfo }>(`/apps/savestat/${appId}`, {
    statid: s.statId,
    stattype: s.type,
    apiname: s.apiName,
    permission: s.permission,
    incrementonly: s.incrementOnly,
    maxchange: optional(s.maxChange),
    min: optional(s.min),
    max: optional(s.max),
    windowsize: optional(s.windowSize),
    default: optional(s.default),
    aggregated: s.aggregated,
    displayname: s.displayName,
  });
}

// ---- Achievements ----

export function fetchAchievements(appId: number) {
  return get<{ achievements: AchievementInfo[]; languages: unknown }>(`/apps/fetchachievements/${appId}`);
}

/** One achievement, addressed by the stat and bit that hold it. */
export function fetchAchievement(appId: number, statId: number, bitId: number) {
  return post<AchievementInfo>(`/apps/fetchachievement/${appId}/${statId}/${bitId}`, {});
}

/**
 * Creates an empty achievement. Steam packs achievements as bits of stats,
 * so it needs the highest stat and bit in use to pick the next slot.
 */
export function newAchievement(appId: number, maxStatId: number, maxBitId: number) {
  return post<{
    success: number;
    error?: string;
    maxstatid: number;
    maxbitid: number;
    achievement: AchievementInfo;
  }>(`/apps/newachievement/${appId}`, { maxstatid: maxStatId, maxbitid: maxBitId });
}

export function saveAchievement(appId: number, a: AchievementSave) {
  return post<{ success: number; error?: string; saved?: boolean; achievement?: AchievementInfo }>(
    `/apps/saveachievement/${appId}`,
    {
      statid: a.statId,
      bitid: a.bitId,
      apiname: a.apiName,
      displayname: JSON.stringify(a.displayName),
      description: JSON.stringify(a.description),
      permission: a.permission,
      hidden: a.hidden,
      // The page sends -1 / 0 / 0 for "no progress stat".
      progressStat: a.progressStat ?? -1,
      progressMin: a.progressMin ?? 0,
      progressMax: a.progressMax ?? 0,
    },
  );
}

/**
 * The page posts this from a hidden iframe form; the iframe body is JSON with
 * `success` and `message`, the same pair other partner-site actions return.
 */
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
  return JSON.parse(await response.text()) as { success: number | boolean; message?: string };
}
