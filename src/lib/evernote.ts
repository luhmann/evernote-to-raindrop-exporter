import evernote from "evernote";
import { EMPTY, forkJoin, from, Observable, timer } from "rxjs";
import {
  delay,
  delayWhen,
  expand,
  map,
  reduce,
  retryWhen,
  share,
  switchMap,
  tap,
} from "rxjs/operators";
import { config } from "./config";
import { log } from "./logger";
import { batchAndDelay } from "./rxjs-operators";
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
      ).pipe(delay(config.EVERNOTE_API_DELAY));
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
    batchAndDelay(
      (chunk) =>
        forkJoin(chunk.map((id) => getTagName(id))).pipe(
          map((tagNames) =>
            tagNames.map((name, index) => ({
              id: chunk[index],
              name: name,
            }))
          )
        ),
      10,
      500,
      "Tags",
      uniqueTagIds.length
    )
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
    switchMap((notes) => expandTagNamesOnNotes(notes)),
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
