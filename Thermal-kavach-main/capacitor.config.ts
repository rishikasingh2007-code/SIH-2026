import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.thermalkavach.app',
  appName: 'Thermal Kavach',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      providers: ['phone'],
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0e4545',
    },
  },
};

export default config;
