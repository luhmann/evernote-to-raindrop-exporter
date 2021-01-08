import { Logger } from "tslog";
import { config } from "./config";

const log: Logger =
  config?.DEBUG === true ? new Logger() : new Logger({ minLevel: "info" });

export { log };
