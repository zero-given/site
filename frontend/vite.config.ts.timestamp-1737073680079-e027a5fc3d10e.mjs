// vite.config.ts
import { defineConfig } from "file:///C:/work/frontend/node_modules/vite/dist/node/index.js";
import solid from "file:///C:/work/frontend/node_modules/vite-plugin-solid/dist/esm/index.mjs";
import UnoCSS from "file:///C:/work/frontend/node_modules/@unocss/vite/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    solid(),
    UnoCSS()
  ],
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: "esnext",
    modulePreload: {
      polyfill: false
    },
    sourcemap: true,
    minify: "esbuild",
    cssMinify: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "solid": ["solid-js"],
          "solid-web": ["solid-js/web"],
          "virtual": ["virtual:uno.css"],
          "chart": ["chart.js", "chartjs-adapter-date-fns"],
          "utils": ["date-fns", "flexsearch", "lz-string"]
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  optimizeDeps: {
    include: [
      "solid-js",
      "chart.js",
      "date-fns",
      "flexsearch",
      "lz-string",
      "chartjs-adapter-date-fns"
    ],
    exclude: ["@unocss/reset"],
    force: false,
    esbuildOptions: {
      target: "esnext",
      treeShaking: true
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFx3b3JrXFxcXGZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFx3b3JrXFxcXGZyb250ZW5kXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi93b3JrL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCBzb2xpZCBmcm9tICd2aXRlLXBsdWdpbi1zb2xpZCc7XHJcbmltcG9ydCBVbm9DU1MgZnJvbSAnQHVub2Nzcy92aXRlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW1xyXG4gICAgc29saWQoKSxcclxuICAgIFVub0NTUygpLFxyXG4gIF0sXHJcbiAgc2VydmVyOiB7XHJcbiAgICBwb3J0OiA1MTczLFxyXG4gICAgc3RyaWN0UG9ydDogZmFsc2UsXHJcbiAgICBob3N0OiB0cnVlLFxyXG4gICAgcHJveHk6IHtcclxuICAgICAgJy9hcGknOiB7XHJcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAyJyxcclxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgICAgc2VjdXJlOiBmYWxzZVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgdGFyZ2V0OiAnZXNuZXh0JyxcclxuICAgIG1vZHVsZVByZWxvYWQ6IHtcclxuICAgICAgcG9seWZpbGw6IGZhbHNlXHJcbiAgICB9LFxyXG4gICAgc291cmNlbWFwOiB0cnVlLFxyXG4gICAgbWluaWZ5OiAnZXNidWlsZCcsXHJcbiAgICBjc3NNaW5pZnk6IHRydWUsXHJcbiAgICBjc3NDb2RlU3BsaXQ6IHRydWUsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIG1hbnVhbENodW5rczoge1xyXG4gICAgICAgICAgJ3NvbGlkJzogWydzb2xpZC1qcyddLFxyXG4gICAgICAgICAgJ3NvbGlkLXdlYic6IFsnc29saWQtanMvd2ViJ10sXHJcbiAgICAgICAgICAndmlydHVhbCc6IFsndmlydHVhbDp1bm8uY3NzJ10sXHJcbiAgICAgICAgICAnY2hhcnQnOiBbJ2NoYXJ0LmpzJywgJ2NoYXJ0anMtYWRhcHRlci1kYXRlLWZucyddLFxyXG4gICAgICAgICAgJ3V0aWxzJzogWydkYXRlLWZucycsICdmbGV4c2VhcmNoJywgJ2x6LXN0cmluZyddXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDYwMCxcclxuICB9LFxyXG4gIG9wdGltaXplRGVwczoge1xyXG4gICAgaW5jbHVkZTogW1xyXG4gICAgICAnc29saWQtanMnLFxyXG4gICAgICAnY2hhcnQuanMnLFxyXG4gICAgICAnZGF0ZS1mbnMnLFxyXG4gICAgICAnZmxleHNlYXJjaCcsXHJcbiAgICAgICdsei1zdHJpbmcnLFxyXG4gICAgICAnY2hhcnRqcy1hZGFwdGVyLWRhdGUtZm5zJ1xyXG4gICAgXSxcclxuICAgIGV4Y2x1ZGU6IFsnQHVub2Nzcy9yZXNldCddLFxyXG4gICAgZm9yY2U6IGZhbHNlLFxyXG4gICAgZXNidWlsZE9wdGlvbnM6IHtcclxuICAgICAgdGFyZ2V0OiAnZXNuZXh0JyxcclxuICAgICAgdHJlZVNoYWtpbmc6IHRydWUsXHJcbiAgICB9XHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBd08sU0FBUyxvQkFBb0I7QUFDclEsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sWUFBWTtBQUVuQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLE1BQ1Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBLElBQ1o7QUFBQSxJQUNBLFdBQVc7QUFBQSxJQUNYLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLGNBQWM7QUFBQSxJQUNkLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQSxVQUNaLFNBQVMsQ0FBQyxVQUFVO0FBQUEsVUFDcEIsYUFBYSxDQUFDLGNBQWM7QUFBQSxVQUM1QixXQUFXLENBQUMsaUJBQWlCO0FBQUEsVUFDN0IsU0FBUyxDQUFDLFlBQVksMEJBQTBCO0FBQUEsVUFDaEQsU0FBUyxDQUFDLFlBQVksY0FBYyxXQUFXO0FBQUEsUUFDakQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsdUJBQXVCO0FBQUEsRUFDekI7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVM7QUFBQSxNQUNQO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTLENBQUMsZUFBZTtBQUFBLElBQ3pCLE9BQU87QUFBQSxJQUNQLGdCQUFnQjtBQUFBLE1BQ2QsUUFBUTtBQUFBLE1BQ1IsYUFBYTtBQUFBLElBQ2Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
