import proxy from "node-global-proxy";
import { run } from "./importer";
import { getImportConfig, renderIntro } from "./lib/cli";
import { config, loadToken } from "./lib/config";
import { createEvernoteClient, TargetedNotebooks } from "./lib/evernote";
import { log } from "./lib/logger";
import { createRaindropClient } from "./lib/raindrops-api";
import { server } from "./mocks/server";

const configureProxy = () => {
  proxy.setConfig("http://localhost:9090");
  proxy.start();
};

const setupMocks = () => {
  log.debug("Setting up mocks");
  server.listen();
};

(async function () {
  if (config.DEBUG === true) {
    configureProxy();
    setupMocks();
  }

  renderIntro();
  await loadToken();

  createEvernoteClient();
  createRaindropClient();

  const selection = await getImportConfig();

  log.debug("Import-Selection:", selection);

  const targetedNotebooks: TargetedNotebooks = {
    ...(selection.target === "all" ? { all: true } : {}),
    ...(selection.target === "names" ? { names: selection.selectedNames } : {}),
    ...(selection.target === "stacks"
      ? { stacks: selection.selectedStacks }
      : {}),
  };

  await run(targetedNotebooks);
})();
