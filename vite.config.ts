import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Base RELATIVA: el build (dist/) debe funcionar servido desde
  // archivo local (file://) y dentro de un WebView (Tauri/Capacitor),
  // donde las rutas absolutas "/" no resuelven. En dev sigue siendo "/".
  base: './',
  plugins: [react()],
})
