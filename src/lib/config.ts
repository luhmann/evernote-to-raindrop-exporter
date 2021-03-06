import fs from "fs";
import path from "path";
import { requestToken } from "./cli";

let token: { [key: string]: string };

export const loadToken = async () => {
  const pathToTokenFile = path.resolve(process.cwd(), "token.json");
  if (!fs.existsSync(pathToTokenFile)) {
    const token = await requestToken();

    if (token.evernoteToken && token.raindropToken) {
      fs.writeFileSync(
        pathToTokenFile,
        JSON.stringify({
          EVERNOTE_TOKEN: token.evernoteToken,
          RAINDROPS_TOKEN: token.raindropToken,
        })
      );
    }
  }

  const loadedToken = require(pathToTokenFile);
  token = loadedToken;

  return loadedToken;
};

const config = {
  RAINDROPS_API_DELAY: process.env.NODE_ENV === "test" ? 0 : 2000,
  RAINDROPS_API_BATCH_SIZE: 100,
  EVERNOTE_API_DELAY: process.env.NODE_ENV === "test" ? 0 : 1000,
  RAINDROPS_API_URL: "https://api.raindrop.io/rest/v1",
  DEBUG: false,
  getEvernoteToken: () => token?.EVERNOTE_TOKEN,
  getRaindropToken: () => token?.RAINDROPS_TOKEN,
};

export { config };
