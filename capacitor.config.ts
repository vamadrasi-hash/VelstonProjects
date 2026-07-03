import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.56428d20360d437aa9780da4b6ae29ac',
  appName: 'velston-projects',
  webDir: 'dist',
  server: {
    url: 'https://56428d20-360d-437a-a978-0da4b6ae29ac.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    Camera: {
      permissions: ['camera', 'photos'],
    },
    Geolocation: {
      permissions: ['location'],
    },
  },
};

export default config;
