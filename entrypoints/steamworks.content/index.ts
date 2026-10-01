import './style.css';
import { fetchAchievements, fetchStats, getAppIdFromUrl } from '@/utils/steamworks';

// Runs on the Steamworks Stats and Achievements pages of any app.
export default defineContentScript({
  matches: [
    'https://partner.steamgames.com/apps/achievements/*',
    'https://partner.steamgames.com/apps/stats/*',
  ],
  main() {
    const panel = document.createElement('div');
    panel.className = 'swu-panel';
    panel.innerHTML = `
      <strong>Steam Toys</strong>
      <textarea placeholder="Paste JSON here"></textarea>
      <button type="button" data-action="parse">Parse</button>
      <button type="button" data-action="fetch-stats">Fetch stats + achievements (read only)</button>
      <pre></pre>
    `;
    document.body.append(panel);

    const input = panel.querySelector('textarea')!;
    const output = panel.querySelector('pre')!;

    panel.querySelector('[data-action="parse"]')!.addEventListener('click', () => {
      try {
        const data = JSON.parse(input.value);
        output.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        output.textContent = `Invalid JSON: ${(e as Error).message}`;
      }
    });

    // Temporary: shows the response shape so the importer can be built on it.
    panel.querySelector('[data-action="fetch-stats"]')!.addEventListener('click', async () => {
      output.textContent = 'Loading...';
      try {
        const appId = getAppIdFromUrl();
        const stats = await fetchStats(appId);
        const { achievements } = await fetchAchievements(appId);
        console.log('[Steam Toys] fetchachievements', achievements);
        console.log('[Steam Toys] fetchstats', stats);
        output.textContent = JSON.stringify({ stats, achievements }, null, 2);
      } catch (e) {
        output.textContent = `Error: ${(e as Error).message}`;
      }
    });
  },
});
