import { rest } from "msw";
import { merge } from "lodash";
import { config } from "../lib/config";
import {
  getRaindropResponse,
  getCollections,
  getRaindropMultipleResponse,
  raindropResponseTemplate,
} from "./fixtures/raindrops";

const createdCollections: string[] = [];

export const resetRaindropMocks = () => createdCollections.splice(0);

export const raindropHandlers = [
  rest.get(`${config.RAINDROPS_API_URL}/collections`, (req, res, ctx) => {
    const mockCollections = getCollections();
    const response = [
      ...mockCollections,
      ...createdCollections.map((title) =>
        merge({}, mockCollections[0], { title })
      ),
    ];

    return res(
      ctx.status(200),
      ctx.json(getRaindropMultipleResponse(response))
    );
  }),
  rest.post<{ title: string }>(
    `${config.RAINDROPS_API_URL}/collection`,
    (req, res, ctx) => {
      const { title } = req.body;
      createdCollections.push(title);

      const collectionResponse = getRaindropResponse();

      const updatedResponse = {
        ...collectionResponse,
        item: {
          ...collectionResponse.item,
          title,
        },
      };

      return res(ctx.json(updatedResponse));
    }
  ),
  rest.post<{ items: any[] }>(
    `${config.RAINDROPS_API_URL}/raindrops`,
    (req, res, ctx) =>
      res(
        ctx.status(200),
        ctx.json(
          getRaindropMultipleResponse(
            req.body?.items?.map((item) => raindropResponseTemplate(item))
          )
        )
      )
  ),
];
