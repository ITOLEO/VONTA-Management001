import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      ),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || ''),
    },
  };
});
