import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Web yönetim paneli. Moderasyon kodu mobil uygulamayla ORTAKTIR (../app/src/lib), böylece iki taraf aynı sunucu
// fonksiyonlarını aynı şekilde çağırır. Yalnızca sunucu bağlantısı (supabase.ts) web'e özeldir.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { __DEV__: 'false' },
  // Ortak dosyalar ../app altında; oradaki tsconfig (Expo'ya bağlı) okunmasın, bu ayar kullanılsın
  // (metin olarak verilince Vite tsconfig dosyası aramaz)
  esbuild: {
    tsconfigRaw: JSON.stringify({ compilerOptions: { jsx: 'react-jsx', target: 'es2022', useDefineForClassFields: true } }),
  },
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: here('./src/supabase.ts') },
      { find: /^@\/(.*)$/, replacement: `${here('../app/src')}/$1` },
    ],
  },
  server: { fs: { allow: [here('..')] } },
});
