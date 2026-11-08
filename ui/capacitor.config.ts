import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The server the build points at: MY_API_URL from the release pipeline (the Azure API, https), otherwise
 * a laptop running the API over plain http. Read when `npx cap sync` copies this config into the Android project.
 */
const server = process.env['MY_API_URL'] || 'http://localhost:5180';

/**
 * Developer builds call a laptop over plain http, which Android blocks unless allowed. A build pointed at an
 * https server (every pipeline release) allows neither cleartext nor mixed content.
 */
const developerBuild = !server.startsWith('https://');

const config: CapacitorConfig = {
  appId: 'app.mantralayayatra',
  appName: 'Mantralaya Yatra',
  webDir: 'dist/ui/browser',
  // Shown behind the web view while it loads, so there is no flash.
  backgroundColor: '#FBFAF7',
  android: {
    // The app's pages are https://localhost; calling an http laptop API from them is "mixed content".
    allowMixedContent: developerBuild,
  },
  server: {
    // Capacitor's default. The API's CORS settings list https://localhost. The books live in SQLite,
    // which does not depend on this origin.
    androidScheme: 'https',
    cleartext: developerBuild,
  },
};

export default config;
