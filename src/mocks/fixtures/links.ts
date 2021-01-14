import mocker from "mocker-data-generator";
import { mockNotebooks } from "./evernote";

const link = {
  uri: {
    chance: "url",
  },
  notebook: {
    values: Object.values(mockNotebooks),
  },
  notebookId: {
    chance: "guid",
  },
  title: {
    casual: "catch_phrase",
  },
  created: {
    casual: "unix_time",
  },
  tags: [
    {
      casual: "word",
      length: 6,
    },
  ],
  description: {
    casual: "description",
  },
};

export const getLinks = (amount: number) => {
  return mocker().schema("links", link, amount).buildSync().links;
};
