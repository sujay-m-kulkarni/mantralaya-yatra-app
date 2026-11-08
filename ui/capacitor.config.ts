import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mantralayayatra',
  appName: 'Mantralaya Yatra',
  webDir: 'dist/ui/browser',
  // Shown behind the web view while it loads, so there is no flash.
  backgroundColor: '#FBFAF7',
  android: {
    // The API runs over plain http on a laptop during development (http://192.168.x.x:5180).
    // Turn this off once the API is on Azure behind https.
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
