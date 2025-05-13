import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { join } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: [
          'electron',
          'electron-devtools-installer',
          'electron-store',
          '@tensorflow/tfjs-node'
        ]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [svelte()],
    assetsInclude: ['**/*.lottie'],
    build: {
      rollupOptions: {
        input: {
          main: join(__dirname, '/src/renderer/main/index.html'),
          setup: join(__dirname, '/src/renderer/setup/index.html'),
          chara: join(__dirname, '/src/renderer/chara/index.html')
        }
      }
    }
  }
})
