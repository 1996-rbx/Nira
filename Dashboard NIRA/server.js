import { fileURLToPath } from "node:url";
import { createAppServer } from "./src/app.js";
import { config } from "./src/config.js";
import { startDemoLiveMetrics } from "./src/demo-live.js";

const currentFilePath = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && currentFilePath === process.argv[1];

if (isMainModule) {
  startDemoLiveMetrics();
  const server = createAppServer();

  server.listen(config.port, () => {
    console.log(
      `${config.appName} disponible sur ${config.publicBaseUrl} (port ${config.port})`,
    );
  });
}
