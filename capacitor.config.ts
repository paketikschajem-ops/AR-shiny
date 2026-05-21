import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.visionosar.app',
  appName: 'VisionOS AR',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
