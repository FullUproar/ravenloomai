import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ravenloom.app',
  appName: 'RavenLoom',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Production: uses built assets from webDir
    // For local dev, uncomment the following:
    // url: 'http://10.0.2.2:5173',
    // cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0D0D0D',
      showSpinner: false
    }
  }
};

export default config;
