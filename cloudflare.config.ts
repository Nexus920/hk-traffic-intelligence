import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "hk-traffic-intelligence",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-09-29",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      VISITS: bindings.analyticsEngineDataset({ name: "hktraffic_visits" }),
      VISIT_COUNTS: bindings.kv({ id: "04f091e0575e45d8b5d6773a73519377" }),
    },
  }),
});
// Trigger Cloudflare Workers Build
