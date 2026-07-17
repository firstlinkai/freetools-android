import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "click.freetools.app",
  appName: "FreeTools",
  webDir: "dist",
  android: {
    // The app is fully local; the WebView serves bundled assets via scheme
    // interception. Never allow mixed content or remote navigation.
    allowMixedContent: false,
  },
  server: {
    // Keep the default https://localhost custom-scheme origin: crypto.subtle,
    // getUserMedia and other secure-context APIs require a secure origin.
    androidScheme: "https",
  },
};

export default config;
