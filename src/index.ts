import { combineLatest, forkJoin, of, ReplaySubject, Subject } from "rxjs";
import {
  bufferCount,
  catchError,
  concatMap,
  delay,
  last,
  map,
  reduce,
  share,
  switchMap,
  tap,
} from "rxjs/operators";
import { EvernoteNote, importNotes } from "./lib/evernote";
import { log } from "./lib/logger";
import {
  batchCreateRaindrops,
  createCollection,
  getAllCollections,
  mapCollections,
  Raindrop,
} from "./lib/raindrops";
import { convertDateToIso, getEvernoteWebLink } from "./lib/util";

enum ImportFailureReason {
  NO_LINK = "Note is missing URI, currently only links are supported by this script",
}

type ImportFailure = {
  note: EvernoteNote;
  reason: ImportFailureReason;
};

const filterInvalidNotes = (importFailures$: Subject<ImportFailure>) => (
  notes: EvernoteNote[]
) =>
  notes.filter((note) => {
    const shouldInclude = note.link !== null;

    if (!shouldInclude) {
      importFailures$.next({ note, reason: ImportFailureReason.NO_LINK });
    }

    return shouldInclude;
  });

(async function () {
  const importFailures$ = new ReplaySubject<ImportFailure>();
  const importSuccess$ = new ReplaySubject<Raindrop[]>();

  const evernoteNotes$ = importNotes({
    // stacks: [config?.EVERNOTE_STACK_TO_EXPORT as string],
    names: ["2020:Articles"],
  }).pipe(map(filterInvalidNotes(importFailures$)), share());

  const existingCollections$ = getAllCollections().pipe(map(mapCollections));

  const requiredCollections$ = evernoteNotes$.pipe(
    map(
      (notes: EvernoteNote[]) =>
        new Set([...notes.map((note) => note.notebook)].filter(Boolean))
    )
  );

  const collectionsReady$ = combineLatest([
    existingCollections$,
    requiredCollections$,
  ]).pipe(
    map(([existingCollections, requiredCollections]) => {
      const existingNames = existingCollections.map(
        (collection) => collection.name
      );
      const missingCollections = [...requiredCollections].filter(
        (collection) => !existingNames.includes(collection as string)
      );

      log.info(
        "The following collections do not exist in raindrop.io and will be created",
        missingCollections
      );

      return missingCollections;
    }),
    switchMap((collections) =>
      forkJoin(
        collections.map((collection) => {
          log.info(`Creating collection "${collection}" on raindrop.io`);
          return createCollection(collection as string);
        })
      )
    ),
    tap((collections) => {
      for (const collection of collections) {
        log.info(
          `Successfully created collection "${collection.title}" with id "${collection._id}"`
        );
      }
      log.debug(
        `Created collection-ids "${collections.map((col) => col._id)}"`
      );
    }),
    switchMap(() => getAllCollections()),
    map((collections) => {
      const collectionsMap = new Map();
      for (const collection of collections) {
        collectionsMap.set(collection.title, collection._id);
      }

      return collectionsMap;
    }),
    share()
  );

  const import$ = combineLatest([collectionsReady$, evernoteNotes$]).pipe(
    tap(([, notes]) => log.info(`Importing ${notes.length} Notes`)),
    map(([collectionsMap, notes]) =>
      notes.map((note: EvernoteNote) => ({
        // TODO: get rid off typecasts (undefined is filtered before, cannot be inferred)
        collectionId: collectionsMap.get(note.notebook),
        created: convertDateToIso(note.created as number),
        link: note.link as string,
        title: note.title,
        ...(!!note.tags?.length ? { tags: note.tags } : {}),
      }))
    ),
    concatMap((x) => x), // * spread out the array-values into individual emits
    bufferCount(100),
    concatMap((idChunk) => of(idChunk).pipe(delay(3000))),
    tap(() => log.debug("Processing chunk")),
    switchMap((chunk) =>
      batchCreateRaindrops(chunk).pipe(
        catchError((err) => {
          log.error(err);
          return of([]);
        })
      )
    ),
    tap(() => log.debug("Successfully created chunk of notes")),
    share()
  );

  import$.subscribe(
    (notes) => {
      importSuccess$.next(notes);
    },
    (err) => log.fatal("Import failed without recovery", err),
    () => {
      log.info("Import successfully completed");
      importSuccess$.complete();
      importFailures$.complete();
    }
  );

  const importSuccessMessages$ = importSuccess$.pipe(
    concatMap((x) => x),
    share()
  );

  const importFailureMessages$ = importFailures$.pipe(share());

  importSuccessMessages$.subscribe((note) => {
    log.debug(`Created raindrop "${note.title}" -- id "${note._id}"`);
  });

  importSuccessMessages$
    .pipe(reduce((acc, item) => [...acc, item], [] as Raindrop[]))
    .subscribe((created) => {
      console.log(
        "----------------------------------------------------------------"
      );
      log.info(`Created ${created.length} raindrops.`);
      console.log(created.map((raindrop) => raindrop._id));
    });

  importFailureMessages$.subscribe((failure: ImportFailure) => {
    log.warn(
      `Note with title "${failure.note.title}" from notebook "${failure.note.notebook}"could not be imported. Reason: ${failure.reason}`
    );
  });

  importFailureMessages$
    .pipe(reduce((acc, item) => [...acc, item], [] as ImportFailure[]))
    .subscribe((failures) => {
      console.log(
        "----------------------------------------------------------------"
      );
      log.warn(`Could not import ${failures.length} notes`);
      console.log(
        failures.map((failure) => [
          failure.note.title,
          getEvernoteWebLink(failure.note.notebookGuid, failure.note.guid) ??
            failure.note.guid,
        ])
      );
    });
})();
