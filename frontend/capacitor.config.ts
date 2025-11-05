import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ravenloom.app',
  appName: 'RavenLoom',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    // For local development on emulator, use 10.0.2.2 (emulator's special localhost IP)
    url: 'http://10.0.2.2:5173',
    cleartext: true,
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
