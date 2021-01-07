import dotenv from "dotenv";
import { log } from "./logger";

const { parsed } = dotenv.config();

// TODO: add config validation

const config: dotenv.DotenvParseOutput | { [key: string]: any } = {
  ...parsed,
  RAINDROPS_API_DELAY: 1000,
  RAINDROPS_API_BATCH_SIZE: 100,
  EVERNOTE_API_DELAY: 2000,
};

export { config };
