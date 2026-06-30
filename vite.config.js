import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main:  'index.html',
        boss:  'boss.html',
        km:    'branch-KM.html',
        t1:    'branch-T1.html',
        tw2:   'branch-TW2.html',
        tw1:   'branch-TW1.html',
        ld:    'branch-LD.html',
        kb:    'branch-KB.html',
        t5:    'branch-T5.html',
        itcc:  'branch-ITCC.html',
        tenom: 'branch-TENOM.html',
        hq:    'branch-HQ.html',
      },
    },
  },
})
