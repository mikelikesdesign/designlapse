import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the viewer into one self-contained HTML file: ../template/page.html.
// The designlapse CLI fills in __FLOW_TITLE__ and __FLOW_DATA__ when it builds a project's page.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: '../template',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: path.resolve(__dirname, 'page.html') },
  },
})
