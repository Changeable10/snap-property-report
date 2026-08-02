// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [
    VitePWA({
      // HTML is rendered per-request by the Nitro/Cloudflare worker (there's no static
      // index.html), so the service worker only precaches the hashed JS/CSS bundle and
      // exists to detect new deploys — it must never take over navigation requests, or
      // installed PWA instances could get served stale HTML from the SW's own cache.
      strategies: "generateSW",
      registerType: "prompt",
      injectRegister: false,
      manifest: false,
      outDir: ".output/public",
      includeManifestIcons: false,
      workbox: {
        globDirectory: ".output/public",
        globPatterns: ["assets/**/*.{js,css}"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
