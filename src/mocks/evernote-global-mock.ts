import { getMockData } from "./fixtures/evernote";

const evernote = jest.requireActual("evernote");

const { data: mockData, info } = getMockData(1_500);

export const listNotebooks = jest.fn(() => Promise.resolve(mockData.notebooks));

export const findNotesMetadata = jest.fn(
  (notebookFilter: any, start: number, count: number) => {
    const notesForNotebook = mockData.notes.filter(
      (note) => note.notebookGuid === notebookFilter.notebookGuid
    );

    const end = start + count;

    return Promise.resolve({
      startIndex: start,
      totalNotes: notesForNotebook.length,
      notes: notesForNotebook.slice(start, end),
    });
  }
);

const tagMap = new Map(mockData.tags.map((tag) => [tag.guid, tag]));
export const getTag = jest.fn((tagId: string) => {
  return tagMap.get(tagId);
});

export default {
  Client: jest.fn(() => ({
    getNoteStore: () => ({
      listNotebooks,
      findNotesMetadata,
      getTag,
    }),
    __test: info,
  })),
  NoteStore: {
    NotesMetadataResultSpec: jest.fn(),
    NoteFilter: jest.fn((input) => input),
  },
  Errors: evernote.Errors,
};
