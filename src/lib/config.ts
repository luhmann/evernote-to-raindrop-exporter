import fs from "fs";
import path from "path";
import { requestToken } from "./cli";

let token: { [key: string]: string };

export const loadToken = async () => {
  const pathToTokenFile = path.join(__dirname, "..", "..", "token.json");
  if (!fs.existsSync(pathToTokenFile)) {
    const token = await requestToken();

    fs.writeFileSync(
      pathToTokenFile,
      JSON.stringify({
        EVERNOTE_TOKEN: token.evernoteToken,
        RAINDROPS_TOKEN: token.raindropToken,
      })
    );
  }

  const loadedToken = require(pathToTokenFile);
  token = loadedToken;

  return loadedToken;
};

const config = {
  RAINDROPS_API_DELAY: 2000,
  RAINDROPS_API_BATCH_SIZE: 100,
  EVERNOTE_API_DELAY: 2000,
  RAINDROPS_API_URL: "https://api.raindrop.io/rest/v1",
  DEBUG: false,
  getEvernoteToken: () => token?.EVERNOTE_TOKEN,
  getRaindropToken: () => token?.RAINDROPS_TOKEN,
};

export { config };
