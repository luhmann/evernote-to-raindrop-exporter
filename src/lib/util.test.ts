import { convertDateToIso, getEvernoteWebLink } from "./util";

describe(getEvernoteWebLink.name, () => {
  test("when ids for notebook and note are passed, then it returns a link", () => {
    expect(getEvernoteWebLink("notebook-id", "note-id")).toEqual(
      "https://www.evernote.com/client/web#?b=notebook-id&n=note-id"
    );
  });

  test("when note-id is missing, then undefined is returned", () => {
    expect(getEvernoteWebLink("notebook-id")).toEqual(undefined);
  });

  test("when notebook-id is missing, then undefined is returned", () => {
    expect(getEvernoteWebLink(undefined)).toEqual(undefined);
  });
});

describe(convertDateToIso.name, () => {
  test("when passing an epoch-string, then an iso-date is returned", () => {
    expect(convertDateToIso(1610293978411)).toEqual("2021-01-10T15:52:58.411Z");
  });

  test("when passing a falsy value, then `undefined` is returned", () => {
    expect(convertDateToIso(undefined)).toEqual(undefined);
  });
});
