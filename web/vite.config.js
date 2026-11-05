import { defineConfig } from "vite";

// Link previews need absolute URLs. Build with SITE_URL=https://.../ to write them;
// without it the relative path stays, which is fine for local use.
const siteUrl = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, "/") : "";
const absoluteMeta = {
  name: "absolute-meta",
  transformIndexHtml(html) {
    if (!siteUrl) return html;
    return html
      .replace('content="./og.png"', `content="${siteUrl}og.png"`)
      .replace("</title>", `</title>\n  <link rel="canonical" href="${siteUrl}" />\n  <meta property="og:url" content="${siteUrl}" />`);
  },
};

export default defineConfig({
  base: "./",
  plugins: [absoluteMeta],
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  worker: { format: "es" },
});
