// The JSON Steam Toys for Unity copies from its stat and achievement inspectors and DBs:
// { format: "steam-toys/1", kind, appId, items }. See SteamworksJson.cs in steam-toys-for-unity.

import { Permission, type StatType } from './steamworks';

export const PAYLOAD_FORMAT = 'steam-toys/1';

export type PayloadKind = 'stats' | 'achievements';

export type PermissionName = 'Client' | 'GameServer' | 'OfficialGameServer';

export interface StatItem {
  apiName: string;
  type: StatType;
  displayName: string;
  permission: PermissionName;
  aggregated: boolean;
  incrementOnly: boolean;
  default: number | null;
  min: number | null;
  max: number | null;
  maxChange: number | null;
  /** AVGRATE only. */
  windowSize: number | null;
}

/** English text, or text by Steam language ("english", "polish", ...), which the Unity side may send later. */
export type LocalizedInput = string | Record<string, string>;

export interface IconFile {
  fileName: string;
  /** The file as base64. */
  data: string;
}

export interface AchievementItem {
  apiName: string;
  displayName: LocalizedInput;
  description: LocalizedInput;
  permission: PermissionName;
  hidden: boolean;
  progress: { stat: string; min: number | null; max: number | null } | null;
  /** Null leaves the icon on Steamworks as it is. */
  icon: IconFile | null;
  lockedIcon: IconFile | null;
}

export const permissionValue: Record<PermissionName, Permission> = {
  Client: Permission.Client,
  GameServer: Permission.GameServer,
  OfficialGameServer: Permission.OfficialGameServer,
};

/** Parses pasted stats JSON for `appId`, throwing a message fit for the user when it is not that. */
export function parseStatsPayload(text: string, appId: number): StatItem[] {
  const items = parseEnvelope(text, 'stats', appId).map((item, index) => checkStat(item, index));
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.apiName)) throw new Error(`The API Name "${item.apiName}" is in the JSON twice.`);
    seen.add(item.apiName);
  }
  return items;
}

/** Parses pasted achievements JSON for `appId`, throwing a message fit for the user when it is not that. */
export function parseAchievementsPayload(text: string, appId: number): AchievementItem[] {
  const items = parseEnvelope(text, 'achievements', appId).map((item, index) => checkAchievement(item, index));
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.apiName)) throw new Error(`The API Name "${item.apiName}" is in the JSON twice.`);
    seen.add(item.apiName);
  }
  return items;
}

/** The items of pasted JSON, after checking it is Steam Toys JSON of `kind` for `appId`. */
function parseEnvelope(text: string, kind: PayloadKind, appId: number): unknown[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`This is not valid JSON: ${(e as Error).message}`);
  }

  if (!isObject(data) || data.format !== PAYLOAD_FORMAT)
    throw new Error(`This is not Steam Toys JSON (expected "format": "${PAYLOAD_FORMAT}"). Copy it from Unity again.`);

  if (data.kind !== kind) {
    const page = data.kind === 'stats' ? 'Stats' : 'Achievements';
    throw new Error(`This JSON holds ${String(data.kind)}. Paste it on the ${page} page instead.`);
  }

  if (data.appId !== appId)
    throw new Error(`This JSON is for app ${String(data.appId)}, and this page is app ${appId}. Check the App ID in the Steam Settings in Unity.`);

  if (!Array.isArray(data.items)) throw new Error('The JSON has no "items" list.');

  return data.items;
}

function checkStat(item: unknown, index: number): StatItem {
  const where = `Item ${index + 1}`;
  if (!isObject(item)) throw new Error(`${where} is not an object.`);

  const apiName = item.apiName;
  if (typeof apiName !== 'string' || !apiName.trim()) throw new Error(`${where} has no API Name.`);

  const label = `Stat "${apiName}"`;
  if (item.type !== 'INT' && item.type !== 'FLOAT' && item.type !== 'AVGRATE')
    throw new Error(`${label} has an unknown type: ${String(item.type)}.`);
  if (typeof item.permission !== 'string' || !(item.permission in permissionValue))
    throw new Error(`${label} has an unknown permission: ${String(item.permission)}.`);

  return {
    apiName,
    type: item.type,
    displayName: typeof item.displayName === 'string' ? item.displayName : '',
    permission: item.permission as PermissionName,
    aggregated: item.aggregated === true,
    incrementOnly: item.incrementOnly === true,
    default: optionalNumber(item.default, `${label} default`),
    min: optionalNumber(item.min, `${label} min`),
    max: optionalNumber(item.max, `${label} max`),
    maxChange: optionalNumber(item.maxChange, `${label} max change`),
    windowSize: optionalNumber(item.windowSize, `${label} window size`),
  };
}

function checkAchievement(item: unknown, index: number): AchievementItem {
  const where = `Item ${index + 1}`;
  if (!isObject(item)) throw new Error(`${where} is not an object.`);

  const apiName = item.apiName;
  if (typeof apiName !== 'string' || !apiName.trim()) throw new Error(`${where} has no API Name.`);

  const label = `Achievement "${apiName}"`;
  if (typeof item.permission !== 'string' || !(item.permission in permissionValue))
    throw new Error(`${label} has an unknown permission: ${String(item.permission)}.`);

  let progress: AchievementItem['progress'] = null;
  if (item.progress !== null && item.progress !== undefined) {
    if (!isObject(item.progress) || typeof item.progress.stat !== 'string' || !item.progress.stat)
      throw new Error(`${label} has a progress without a stat.`);
    progress = {
      stat: item.progress.stat,
      min: optionalNumber(item.progress.min, `${label} progress min`),
      max: optionalNumber(item.progress.max, `${label} progress max`),
    };
  }

  return {
    apiName,
    displayName: localized(item.displayName, `${label} display name`),
    description: localized(item.description, `${label} description`),
    permission: item.permission as PermissionName,
    hidden: item.hidden === true,
    progress,
    icon: iconFile(item.icon, `${label} icon`),
    lockedIcon: iconFile(item.lockedIcon, `${label} locked icon`),
  };
}

function localized(value: unknown, label: string): LocalizedInput {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (isObject(value) && Object.values(value).every((text) => typeof text === 'string'))
    return value as Record<string, string>;
  throw new Error(`${label} is neither text nor text by language.`);
}

function iconFile(value: unknown, label: string): IconFile | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || typeof value.data !== 'string' || !value.data) throw new Error(`${label} has no file data.`);
  return { fileName: typeof value.fileName === 'string' && value.fileName ? value.fileName : 'icon.png', data: value.data };
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} is not a number.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
