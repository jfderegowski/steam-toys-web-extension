import './style.css';
import { applyAchievements, describeAchievement, planAchievements } from '@/utils/achievementsImport';
import { parseAchievementsPayload, parseStatsPayload } from '@/utils/payload';
import { applyStats, describeStat, planStats } from '@/utils/statsImport';
import { fetchAchievements, fetchStats, getAppIdFromUrl, readMaxIdsFromPage } from '@/utils/steamworks';
import { mountImportPanel, type ImportPanelOptions } from './importPanel';

// Adds the Steam Toys import panel to the Steamworks Stats and Achievements pages of any app.
export default defineContentScript({
  matches: [
    'https://partner.steamgames.com/apps/achievements/*',
    'https://partner.steamgames.com/apps/stats/*',
  ],
  // The styles go into the panel's shadow root, away from the page's own CSS.
  cssInjectionMode: 'ui',
  async main(ctx) {
    const appId = getAppIdFromUrl();
    const options = location.pathname.startsWith('/apps/stats/') ? statsOptions(appId) : achievementsOptions(appId);

    const ui = await createShadowRootUi(ctx, {
      name: 'steam-toys-panel',
      position: 'inline',
      anchor: 'body',
      // Keeps typing in the panel from reaching the page's keyboard handlers.
      isolateEvents: true,
      onMount: (container) => mountImportPanel(container, options as ImportPanelOptions<unknown>),
    });
    ui.mount();
  },
});

function statsOptions(appId: number): ImportPanelOptions<ReturnType<typeof planStats>[number]> {
  return {
    title: 'Steam Toys · Import stats',
    noun: 'stats',
    appId,
    async plan(text, status) {
      const items = parseStatsPayload(text, appId);
      status('Reading the stats on Steamworks...');
      return planStats(items, await fetchStats(appId));
    },
    describe: describeStat,
    apply: (plan, deleteMissing, log) =>
      applyStats(appId, plan, deleteMissing, readMaxIdsFromPage().maxStatId, log, (maxStatId) => setPageValue('max_statid_used', maxStatId)),
  };
}

function achievementsOptions(appId: number): ImportPanelOptions<Awaited<ReturnType<typeof planAchievements>>[number]> {
  return {
    title: 'Steam Toys · Import achievements',
    noun: 'achievements',
    appId,
    async plan(text, status) {
      const items = parseAchievementsPayload(text, appId);
      status('Reading the achievements and stats on Steamworks...');
      const [{ achievements }, stats] = await Promise.all([fetchAchievements(appId), fetchStats(appId)]);
      return planAchievements(items, achievements, stats, (done, total) => status(`Comparing icons... ${done}/${total}`));
    },
    describe: describeAchievement,
    apply: (plan, deleteMissing, log) =>
      applyAchievements(appId, plan, deleteMissing, readMaxIdsFromPage(), log, ({ maxStatId, maxBitId }) => {
        setPageValue('max_statid_used', maxStatId);
        setPageValue('max_bitid_used', maxBitId);
      }),
  };
}

/** The page's own New buttons read these hidden values, so they must not fall behind the import. */
function setPageValue(id: string, value: number) {
  const span = document.getElementById(id);
  if (span) span.textContent = String(value);
}
