import type { CapacitorConfig } from '@capacitor/cli';

/**
 * MODO DESENVOLVIMENTO: aponta para o servidor local
 * MODO PRODUÇÃO: aponta para a URL da Vercel
 *
 * Para produção, substitua serverUrl pela URL real da Vercel:
 * serverUrl: 'https://kronos-ai.vercel.app'
 */
const config: CapacitorConfig = {
  appId: 'com.kronos.app',
  appName: 'Kronos',
  webDir: 'out',
  server: {
    // Aponta para o deploy na Vercel — o app mobile carrega a versão web hospedada
    // Substitua pela URL real após o deploy:
    url: 'https://kronos-ai.vercel.app',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      releaseType: 'APK',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
  },
};

export default config;
