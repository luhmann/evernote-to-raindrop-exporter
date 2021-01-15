import proxy from "node-global-proxy";
import { run } from "./importer";
import { getImportConfig, renderIntro } from "./lib/cli";
import { config, loadToken } from "./lib/config";
import { createEvernoteClient, TargetedNotebooks } from "./lib/evernote";
import { log } from "./lib/logger";
import { createRaindropClient } from "./lib/raindrops-api";

const configureProxy = () => {
  log.debug("Proxying all requests through Proxyman");
  proxy.setConfig("http://localhost:9090");
  proxy.start();
};

(async function () {
  if (config.DEBUG === true) {
    configureProxy();
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
