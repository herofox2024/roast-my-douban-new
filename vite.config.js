import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ 
  plugins: [sveltekit(), tailwindcss()],
  
  // 预览服务器配置（用于生产环境） 
  preview: { 
    host: '0.0.0.0',  // 监听所有网络接口 
    port: process.env.PORT || 4173,  // 使用 Render 分配的端口 
    allowedHosts: [ 
      'roast-my-douban-new.onrender.com',  // 允许你的域名 
      '.onrender.com'  // 允许所有 onrender.com 子域名 
    ] 
  }, 
  
  // 开发服务器配置 
  server: { 
    host: '0.0.0.0', 
    port: 5173 
  } 
})
