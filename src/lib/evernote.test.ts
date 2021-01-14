import {
  findNotesMetadata,
  getTag,
  listNotebooks,
} from "../mocks/evernote-global-mock";
import { mockNotebooks } from "../mocks/fixtures/evernote";
import { createEvernoteClient, importNotes } from "./evernote";
import { log } from "./logger";

const evernote = jest.requireActual("evernote");

describe("Evernote Service", () => {
  let client: any;

  beforeEach(() => {
    client = createEvernoteClient();
  });

  describe(importNotes.name, () => {
    test("when passed a stack of notebooks, then it emits the notes within all of them", (done) => {
      expect.hasAssertions();
      const subject = importNotes({ stacks: ["work"] });

      subject.subscribe((notes) => {
        expect(notes.map((item) => item.id)).toEqual(
          jasmine.arrayContaining([
            ...client.__test.notesByNotebook[mockNotebooks.STACK_1].ids,
            ...client.__test.notesByNotebook[mockNotebooks.STACK_2].ids,
          ])
        );
        done();
      });
    });

    test("when passed the name of notebooks, then it emits the notes within them", (done) => {
      expect.hasAssertions();
      const subject = importNotes({
        names: [mockNotebooks.NO_STACK_1, mockNotebooks.STACK_2],
      });

      subject.subscribe((notes) => {
        expect(notes.map((item) => item.id)).toEqual(
          jasmine.arrayContaining([
            ...client.__test.notesByNotebook[mockNotebooks.NO_STACK_1].ids,
            ...client.__test.notesByNotebook[mockNotebooks.STACK_2].ids,
          ])
        );
        done();
      });
    });

    test("when all notes are targeted, then it emits all notes in all notebooks", (done) => {
      expect.hasAssertions();
      const subject = importNotes({
        all: true,
      });

      subject.subscribe((notes) => {
        expect(notes.map((item) => item.id)).toEqual(
          jasmine.arrayContaining([
            ...client.__test.notesByNotebook[mockNotebooks.NO_STACK_1].ids,
            ...client.__test.notesByNotebook[mockNotebooks.NO_STACK_2].ids,
            ...client.__test.notesByNotebook[mockNotebooks.STACK_1].ids,
            ...client.__test.notesByNotebook[mockNotebooks.STACK_2].ids,
          ])
        );
        done();
      });
    });

    test("when no notebooks with the provided config are found, then it should abort with an error", (done) => {
      expect.hasAssertions();
      const subject = importNotes({ names: ["non-existent"] });

      subject.subscribe(
        () => {},
        (error) => {
          expect(error.message).toContain(
            "No notebooks with the specified names or stack found"
          );
          done();
        }
      );
    });

    test("when notes are emitted, then the tags are expanded to their names", (done) => {
      expect.hasAssertions();
      const subject = importNotes({
        names: [mockNotebooks.NO_STACK_1],
      });

      subject.subscribe((notes) => {
        const noteWithTags = notes.find(
          (item) => item.tags && item.tags.length > 0
        );
        expect(noteWithTags?.tags?.[0]).toStrictEqual(jasmine.any(String));
        expect(noteWithTags?.tags?.[0]).not.toMatch(
          /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i
        );
        done();
      });
    });

    test("when an empty notebook is targeted, then it is skipped", (done) => {
      // TODO: not a very expressive test, inject failure stream and assert on that
      expect.hasAssertions();
      listNotebooks.mockImplementationOnce(() =>
        Promise.resolve([
          ...client.__test.notebooks,
          {
            id: "a88ba080-72c2-4616-9fc1-4311193f5e2e",
            name: "Empty Notebook",
          },
        ])
      );

      importNotes({
        names: [mockNotebooks.NO_STACK_1, "Empty Notebook"],
      }).subscribe((notes) => {
        expect(
          notes.find((note) => note.notebook === "Empty Notebook")
        ).toBeUndefined();
        done();
      });
    });

    test("when there is a rate-limit-error while loading notebooks, then it should retry and succeed", (done) => {
      expect.hasAssertions();
      findNotesMetadata.mockImplementationOnce(() =>
        Promise.reject(
          new evernote.Errors.EDAMSystemException({
            errorCode: evernote.Errors.EDAMErrorCode.RATE_LIMIT_REACHED,
            rateLimitDuration: 0.5,
          })
        )
      );

      importNotes({
        names: [mockNotebooks.NO_STACK_1],
      }).subscribe((notes) => {
        expect(notes.map((item) => item.id)).toEqual(
          jasmine.arrayContaining([
            ...client.__test.notesByNotebook[mockNotebooks.NO_STACK_1].ids,
          ])
        );
        done();
      });
    });

    test("when there is a rate-limit-error while loading tags, then it should retry and succeed", (done) => {
      expect.hasAssertions();
      getTag.mockImplementationOnce(() =>
        Promise.reject(
          new evernote.Errors.EDAMSystemException({
            errorCode: evernote.Errors.EDAMErrorCode.RATE_LIMIT_REACHED,
            rateLimitDuration: 0.5,
          })
        )
      );

      importNotes({
        names: [mockNotebooks.NO_STACK_1],
      }).subscribe((notes) => {
        expect(notes.map((item) => item.id)).toEqual(
          jasmine.arrayContaining([
            ...client.__test.notesByNotebook[mockNotebooks.NO_STACK_1].ids,
          ])
        );
        done();
      });
    });
  });
});
