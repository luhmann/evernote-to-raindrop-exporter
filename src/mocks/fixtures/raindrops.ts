import mocker from "mocker-data-generator";
import { RaindropLink } from "../../lib/raindrops";
import { RaindropCollection } from "../../lib/raindrops-api";
import { mockNotebooks } from "./evernote";

const collection = {
  title: {
    values: [
      mockNotebooks.STACK_1,
      mockNotebooks.NO_STACK_1,
      "raindrop-only-1",
      "raindrop-only-2",
    ],
  },
  public: {
    static: false,
  },
  view: {
    static: "list",
  },
  _id: {
    casual: "integer(100000, 900000)",
  },
  created: {
    faker: "date.past",
  },
  lastUpdate: {
    faker: "date.past",
  },
  author: {
    static: true,
  },
};

export const raindropResponseTemplate = ({
  collectionId,
  excerpt,
  tags,
  link,
  created,
  title,
}: any) => ({
  excerpt,
  type: "link",
  cover: "",
  tags,
  removed: false,
  link,
  collection: {
    $ref: "collections",
    $id: 81435,
    oid: 90427,
  },
  created,
  pleaseParse: {
    weight: 1,
    disableNotification: true,
    date: "2021-01-15T08:30:24.562Z",
  },
  user: {
    $ref: "users",
    $id: 93828,
  },
  media: [],
  lastUpdate: created,
  domain: "javascript.info",
  title,
  _id: 38353,
  creatorRef: 93828,
  sort: 230163271,
  __v: 0,
  collectionId,
});

const collections = mocker()
  .schema("collections", collection, { uniqueField: "title" })
  .buildSync().collections;

export const getCollections = () => collections;

export const getRaindropMultipleResponse = (collections?: any[]) => ({
  result: true,
  items: collections ?? getCollections(),
});

export const getRaindropResponse = (collection?: any) => ({
  result: true,
  item: collection ?? getCollections()[0],
});
