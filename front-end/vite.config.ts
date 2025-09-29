import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import path from "path";
import wasm from "vite-plugin-wasm"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [react(), mkcert(), wasm()],
    base: process.env.PUBLIC_URL,
    server: {
      port: 5173,
      // Keep host false to avoid breaking AR functionality
      // host: true, 
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              const key = env.VITE_API_KEY || 'secret2';
              proxyReq.setHeader('Authorization', key);
            });
          }
        }
      },
    },  
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    build: {
      outDir: "build",
      rollupOptions: {
        external: ['@mediapipe/face_mesh', '@mediapipe/camera_utils'],
        output: {
          format: 'es',
        },
      },
    },
    optimizeDeps: {
      exclude: ['@mediapipe/face_mesh', '@mediapipe/camera_utils'],
      include: ['@mediapipe/tasks-vision']
    },
    resolve: {
      alias: {
        '@': '/src',
        'three': path.resolve(__dirname, 'node_modules/three')
      },
    },
    esbuild: {
      logOverride: { 'this-is-undefined-in-esm': 'silent' }
    }
  }
});