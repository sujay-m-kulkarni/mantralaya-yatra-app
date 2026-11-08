import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The server this build talks to: app.config.json (the Azure API), or MY_API_URL when working against the API
 * on a laptop. Read when `npx cap sync` copies this config into the Android project.
 */
const appConfig = JSON.parse(readFileSync(join(__dirname, 'app.config.json'), 'utf8').replace(/^\uFEFF/, '')) as {
  apiUrl?: string;
};
const server = process.env['MY_API_URL'] || appConfig.apiUrl || 'http://localhost:5180';

/**
 * Only a build pointed at an http laptop API allows plain-http traffic; an https server (Azure) allows neither
 * cleartext nor mixed content.
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
