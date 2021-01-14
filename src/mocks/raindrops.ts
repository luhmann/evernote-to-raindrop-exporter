import { rest } from "msw";
import { config } from "../lib/config";
import { getCollectionsResponse } from "./fixtures/raindrops/collections";

export const raindropHandlers = [
  rest.get(`${config.RAINDROPS_API_URL}/collections`, (req, res, ctx) => {
    console.log(req);
    return res(ctx.status(200), ctx.json(getCollectionsResponse()));
  }),
];
