# Steam Toys

Browser extension that imports Steam stats and achievements into the Steamworks partner site from a JSON file, since Steamworks has no API for defining them.

Built with [WXT](https://wxt.dev).

## Development

```bash
npm install
npm run dev
```

`npm run dev` opens a separate Chrome profile with the extension loaded and reloads it on every change. Log in to Steamworks in that window and open **Stats & Achievements** of your app; the Steam Toys panel appears in the bottom-right corner.

## Build

```bash
npm run build   # unpacked extension in .output/chrome-mv3
npm run zip     # zip ready for the Chrome Web Store
```

To use the built extension in your normal Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `.output/chrome-mv3`.
