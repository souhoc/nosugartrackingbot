import { defineWranglerConfig } from "wrangler/experimental-config";

// Mini App page lives in public/. Paths that are not files go to the Worker.
export default defineWranglerConfig({
  assetsDirectory: "public",
});
