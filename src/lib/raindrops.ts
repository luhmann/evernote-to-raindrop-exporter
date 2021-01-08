import got, { Got, NormalizedOptions } from "got";
import { from, Observable } from "rxjs";
import { map } from "rxjs/operators";
import { config } from "./config";
import { log } from "./logger";

let requestClient: Got;

export const createRaindropClient = () => {
  const client = got.extend({
    headers: {
      Authorization: `Bearer ${config.getRaindropToken()}`,
    },
    hooks: {
      beforeRequest: [
        (options: NormalizedOptions) => {
          log.debug(`${options.method} ${options.url.href}`);
        },
      ],
    },
    prefixUrl: config?.RAINDROPS_API_URL,
    responseType: "json",
  });

  requestClient = client;
  return client;
};

type RaindropBaseResponse<T> = {
  result: boolean;
  item: T;
  items: T;
  error?: string;
  errorMessage?: string;
};

type RaindropResponse<T> = Omit<RaindropBaseResponse<T>, "items">;
type RaindropBatchResponse<T> = Omit<RaindropBaseResponse<T>, "item">;

export type Raindrop = {
  _id?: number;
  collectionId: number;
  created?: string;
  excerpt?: string;
  link: string;
  tags?: string[];
  title?: string;
  type?: "link" | "article";
};

export type RaindropCollection = {
  _id: number;
  title: string;
};

export const mapCollections = (collections: RaindropCollection[]) =>
  collections.map((collection) => ({
    id: collection._id,
    name: collection.title,
  }));

export const getAllCollections = (): Observable<RaindropCollection[]> =>
  from(
    requestClient.get<RaindropBatchResponse<RaindropCollection[]>>(
      "collections"
    )
  ).pipe(map((res) => res.body.items));

export const createCollection = (
  name: string
): Observable<RaindropCollection> =>
  from(
    requestClient.post<RaindropResponse<RaindropCollection>>("collection", {
      json: { title: name },
    })
  ).pipe(map((res) => res.body.item));

export const deleteCollections = (
  ids: number[]
): Observable<RaindropCollection> =>
  from(
    requestClient.delete<RaindropBatchResponse<RaindropCollection>>(
      "collections",
      {
        json: { ids },
      }
    )
  ).pipe(map((res) => res.body.items));

const mapRaindropForApiCall = (raindrop: Raindrop) => ({
  collectionId: raindrop.collectionId,
  created: raindrop.created,
  excerpt: raindrop.excerpt,
  link: raindrop.link,
  tags: raindrop.tags,
  title: raindrop.title,
  pleaseParse: {},
});

export const createRaindrop = (raindrop: Raindrop) =>
  from(
    requestClient.post<RaindropResponse<Raindrop>>("raindrop", {
      json: mapRaindropForApiCall(raindrop),
    })
  ).pipe(map((res) => res.body.item));

export const batchCreateRaindrops = (raindrops: Raindrop[]) =>
  from(
    requestClient.post<RaindropBatchResponse<Raindrop[]>>("raindrops", {
      json: { items: raindrops.map(mapRaindropForApiCall) },
    })
  ).pipe(map((res) => res.body.items));

export const deleteRaindrop = (id: number) =>
  from(requestClient.delete(`raindrop/${id}`)).pipe(map((res) => res.body));
