import './style.css';

// Runs on the Steamworks stats & achievements page of any app.
export default defineContentScript({
  matches: ['https://partner.steamgames.com/apps/achievements/*'],
  main() {
    const panel = document.createElement('div');
    panel.className = 'swu-panel';
    panel.innerHTML = `
      <strong>Steam Toys</strong>
      <textarea placeholder="Paste JSON here"></textarea>
      <button type="button">Parse</button>
      <pre></pre>
    `;
    document.body.append(panel);

    const input = panel.querySelector('textarea')!;
    const output = panel.querySelector('pre')!;

    panel.querySelector('button')!.addEventListener('click', () => {
      try {
        const data = JSON.parse(input.value);
        output.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        output.textContent = `Invalid JSON: ${(e as Error).message}`;
      }
    });
  },
});
