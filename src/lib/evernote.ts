import evernote from "evernote";
import { EMPTY, forkJoin, from, Observable, of, timer } from "rxjs";
import {
  bufferCount,
  concatMap,
  delay,
  delayWhen,
  expand,
  flatMap,
  last,
  map,
  mergeMap,
  reduce,
  retryWhen,
  share,
  switchMap,
  tap,
} from "rxjs/operators";
import { config } from "./config";
import { log } from "./logger";
import { Link } from "./util";

const client = new evernote.Client({
  token: config?.EVERNOTE_AUTH_TOKEN,
  sandbox: false,
});
const noteStore = client.getNoteStore();

const notebookDataToLoad = new evernote.NoteStore.NotesMetadataResultSpec({
  includeTitle: true,
  includeContentLength: false,
  includeCreated: true,
  includeUpdated: false,
  includeDeleted: false,
  includeUpdateSequenceNum: false,
  includeNotebookGuid: true,
  includeTagGuids: true,
  includeAttributes: true,
  includeLargestResourceMime: false,
  includeLargestResourceSize: false,
});

export const getNotebookList = (): Promise<evernote.Types.Notebook[]> =>
  noteStore.listNotebooks();

export const getAllNotebooksAndStacks = async () => {
  const notebooks = await getNotebookList();

  return {
    names: notebooks
      .map((notebook) => notebook.name)
      .filter((item): item is string => Boolean(item)),
    stacks: [
      ...new Set([
        ...notebooks
          .map((notebook) => notebook.stack)
          .filter((item): item is string => Boolean(item)),
      ]),
    ],
  };
};

export type TargetedNotebooks = {
  stacks?: string[];
  names?: string[];
};

const filterRelevantNotebooks = ({ stacks, names }: TargetedNotebooks) => (
  notebooks: evernote.Types.Notebook[]
) => {
  const filteredNotebooks = notebooks.filter((notebook) => {
    const stackPredicate =
      !stacks?.length ||
      Boolean(
        notebook.stack &&
          Boolean(notebook.stack && stacks.includes(notebook?.stack))
      );
    const namePredicate =
      !names?.length || Boolean(notebook.name && names.includes(notebook.name));

    return stackPredicate && namePredicate;
  });

  if (filteredNotebooks.length === 0) {
    throw new Error(
      "No notebooks with the specified names or stack found, provide valid notebook names or a valid stack that contains at least one notebook"
    );
  }

  return filteredNotebooks;
};

const getRelevantNoteData = (
  note: evernote.NoteStore.NoteMetadata,
  notebookName: evernote.Types.Notebook["name"]
): Link => {
  if (!notebookName) {
    throw new Error(
      "Could not map evernote-note to generic note-type: Notebook Name missing"
    );
  }
  return {
    id: note.guid,
    title: note.title,
    created: note.created,
    notebook: notebookName,
    notebookId: note.notebookGuid,
    tags: note.tagGuids,
    uri: note.attributes?.sourceURL,
  };
};

/**
 * `findNoteMeta` from Evernote SDK will not return more than 250 notes per request.
 * @see: https://dev.evernote.com/doc/reference/NoteStore.html#Fn_NoteStore_findNotesMetadata
 */
const MAXIMUM_BATCH_SIZE = 250;

const getRangeOfNotesFromNotebook = (
  notebook: evernote.Types.Notebook,
  offset: number,
  limit: number
): Promise<evernote.NoteStore.NotesMetadataList> => {
  const notebookFilter = new evernote.NoteStore.NoteFilter({
    notebookGuid: notebook.guid,
  });

  return noteStore.findNotesMetadata(
    notebookFilter,
    offset,
    limit,
    notebookDataToLoad
  );
};

const getNotesFromNotebook = (
  notebook: evernote.Types.Notebook
): Observable<Link[]> => {
  return from(
    getRangeOfNotesFromNotebook(notebook, 0, MAXIMUM_BATCH_SIZE)
  ).pipe(
    expand((res) => {
      const startIndex = Number(res.startIndex);
      const nextOffset = startIndex + Number(res.notes?.length);
      const totalNotes = Number(res.totalNotes);
      log.info(
        `Loading notes from "${notebook.name}": ${nextOffset}/${totalNotes}.`
      );

      if (Number.isNaN(nextOffset) || Number.isNaN(totalNotes)) {
        log.error(
          "Unexpected response from Evernote-API: Offset and limit of note-search do not seem to be set",
          res
        );
        throw new Error("Unexpected response from Evernote-API");
      }

      if (nextOffset >= totalNotes || totalNotes === 0) {
        if (totalNotes === 0) {
          log.warn(
            `Skipping targeted notebook "${notebook.name}" cause there are no notes in it`
          );
        }
        return EMPTY;
      }

      return from(
        getRangeOfNotesFromNotebook(
          notebook,
          startIndex + MAXIMUM_BATCH_SIZE,
          MAXIMUM_BATCH_SIZE
        )
      ).pipe(delay(3000));
    }),
    reduce<
      evernote.NoteStore.NotesMetadataList,
      evernote.NoteStore.NoteMetadata[]
    >((acc, current) => [...acc, ...(current.notes ?? [])], []),
    map((notes) =>
      notes?.map((note) => getRelevantNoteData(note, notebook.name))
    )
  );
};

const getTagName = async (id: string) => {
  const tag = await noteStore.getTag(id);

  // TODO: probably only wanted by me
  return tag.name?.toLowerCase();
};

const loadTagNamesInBatches = (uniqueTagIds: string[]) =>
  from(uniqueTagIds).pipe(
    bufferCount(10), // ? max load 10 tags in parallel
    concatMap((idChunk, index) =>
      of(idChunk).pipe(
        tap(() =>
          log.info(
            `Loading tag chunk: ${index + 1}/${Math.ceil(
              uniqueTagIds.length / 10
            )}`
          )
        ),
        switchMap((chunk) =>
          forkJoin(chunk.map((id) => getTagName(id))).pipe(
            map((tagNames) =>
              tagNames.map((name, index) => ({
                id: chunk[index],
                name: name,
              }))
            )
          )
        ),
        tap(() =>
          log.debug(
            `Finished tag chunk: ${index + 1}/${Math.ceil(
              uniqueTagIds.length / 10
            )}`
          )
        ),
        delay(1000)
      )
    ),
    concatMap((x) => x)
  );

const expandTagNamesOnNotes = (notesWithTagIds: Link[]) => {
  const uniqueTagIds = [
    ...new Set(notesWithTagIds.flatMap((note) => note.tags ?? [])),
  ];

  log.debug(
    `Identified ${uniqueTagIds.length} unique tags. They will now be loaded in batches.`
  );

  return loadTagNamesInBatches(uniqueTagIds).pipe(
    reduce((acc, item) => {
      if (item.name) {
        acc.set(item.id, item.name);
      }
      return acc;
    }, new Map<string, string>()),
    map((tagIdsToNameMap): Link[] =>
      notesWithTagIds.map((note) => ({
        ...note,
        ...(note.tags
          ? { tags: note.tags.map((id) => tagIdsToNameMap.get(id) ?? id) }
          : {}),
      }))
    )
  );
};

export function importNotes(targetedNotebooks: TargetedNotebooks) {
  const notes: Observable<Link[]> = from(getNotebookList()).pipe(
    map(filterRelevantNotebooks(targetedNotebooks)),
    tap((notebooks) => {
      const notebookNames = notebooks
        .map((notebook) => `"${notebook.name}"`)
        .join(", ");
      log.info(`Found ${notebooks.length} Notebooks: ${notebookNames}`);
    }),
    // TODO: batch number of notebooks that are loaded concurrently
    switchMap((notebooks) => forkJoin(notebooks.map(getNotesFromNotebook))),
    map((notes) => notes.flat()),
    tap(() => log.debug("Expanding tag names...")),
    switchMap((notes) => expandTagNamesOnNotes(notes)),
    tap(() => log.debug("Finished expanding tag names...")),
    retryWhen((err) => {
      // * Evernote applies rate limiting to its APIs, this waits for the returned period of time and then retries the whole operation
      // TODO: check if error is 409 for rate-limiting
      return err.pipe(
        tap((error) =>
          log.error(`Download of notes from evernote failed.`, error)
        ),
        delayWhen((res) => timer(res.rateLimitDuration * 1000)) // ? wait the time requested in API response
      );
    }),
    share()
  );

  return notes;
}
