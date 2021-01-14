import mocker from "mocker-data-generator";

export const mockNotebooks = {
  STACK_1: "test-stack-work-1",
  STACK_2: "test-stack-work-2",
  NO_STACK_1: "test-nostack-1",
  NO_STACK_2: "test-nostack-2",
};

const notebook = {
  guid: {
    chance: "guid",
  },
  name: {
    values: Object.values(mockNotebooks),
  },
  updateSequenceNum: {
    faker: "random.number",
  },
  defaultNotebook: {
    static: false,
  },
  serviceCreated: {
    casual: "unix_time",
  },
  serviceUpdated: {
    casual: "unix_time",
  },
  stack: {
    function() {
      const notebook = (this as any).object;
      if (["test-nostack-1", "test-nostack-2"].includes(notebook.name)) {
        return null;
      }
      return "work";
    },
  },
};

const tag = {
  guid: {
    chance: "guid",
  },
  name: {
    casual: "catch_phrase",
  },
};

const note = {
  guid: {
    chance: "guid",
  },
  title: {
    faker: "lorem.sentence",
  },
  created: {
    casual: "unix_time",
  },
  notebookGuid: {
    hasOne: "notebooks",
    get: "guid",
  },
  tagGuids: {
    hasMany: "tags",
    min: 0,
    max: 4,
    get: "guid",
  },
  attributes: {
    sourceURL: {
      chance: "url",
    },
  },
};

export const getMockData = (numNotes: number) => {
  const data = mocker()
    .schema("notebooks", notebook, { uniqueField: "name" })
    .schema("tags", tag, 100)
    .schema("notes", note, numNotes)
    .buildSync();

  const notebookMap = Object.fromEntries(
    data.notebooks.map((notebook) => [notebook.name, notebook])
  );

  return {
    data,
    info: {
      notebooks: data.notebooks,
      tags: data.tags,
      notesByNotebook: Object.fromEntries(
        Object.entries(mockNotebooks).map(([key, name]) => {
          const notes = data.notes.filter(
            (item) => item.notebookGuid === notebookMap[name]?.guid
          );
          return [
            name,
            {
              notes,
              ids: notes.map((item) => item.guid),
            },
          ];
        })
      ),
    },
  };
};
