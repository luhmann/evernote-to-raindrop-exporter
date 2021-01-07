import {
  combineLatest,
  forkJoin,
  from,
  Observable,
  of,
  ReplaySubject,
  Subject,
} from "rxjs";
import {
  bufferCount,
  catchError,
  concatMap,
  delay,
  map,
  reduce,
  share,
  switchMap,
  take,
  tap,
} from "rxjs/operators";
import { difference } from "remeda";
import type { Required } from "utility-types";
import { confirmImport, getImportConfig } from "./lib/cli";
import { importNotes, TargetedNotebooks } from "./lib/evernote";
import { log } from "./lib/logger";
import {
  batchCreateRaindrops,
  createCollection,
  getAllCollections,
  mapCollections,
  Raindrop,
} from "./lib/raindrops";
import { convertDateToIso, getEvernoteWebLink, Link } from "./lib/util";

enum ImportFailureReason {
  NO_LINK = "Note is missing URI, currently only links are supported by this script",
}

type ImportFailure = {
  note: Link;
  reason: ImportFailureReason;
};

const filterInvalidNotes = (importFailures$: Subject<ImportFailure>) => (
  notes: Link[]
): Required<Link, "uri">[] =>
  notes.filter((note): note is Required<Link, "uri"> => {
    const shouldInclude = Boolean(note.uri);

    if (!shouldInclude) {
      importFailures$.next({ note, reason: ImportFailureReason.NO_LINK });
    }

    return shouldInclude;
  });

const setupLogOutput = () => {
  const importFailures$ = new ReplaySubject<ImportFailure>();
  const importSuccess$ = new ReplaySubject<Raindrop[]>();

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
      log.debug(
        "----------------------------------------------------------------"
      );
      log.info(`Created ${created.length} raindrops.`);
      log.debug(
        "Created raindrop ids",
        created.map((raindrop) => raindrop._id)
      );
    });

  importFailureMessages$.subscribe((failure: ImportFailure) => {
    log.warn(
      `Note with title "${failure.note.title}" from notebook "${failure.note.notebook}" could not be imported. Reason: ${failure.reason}`
    );
  });

  importFailureMessages$
    .pipe(reduce((acc, item) => [...acc, item], [] as ImportFailure[]))
    .subscribe((failures) => {
      log.debug(
        "----------------------------------------------------------------"
      );
      log.warn(
        `Could not import ${failures.length} notes. This usually means that they have no url set. If you think this is a mistake you can check the notes directly in Evernote with the provided links.`
      );
      console.log(
        failures.map((failure) => [
          `Title: ${failure.note.title}`,
          getEvernoteWebLink(failure.note.notebookId, failure.note.id) ??
            failure.note.notebookId,
        ])
      );
    });

  return { importSuccess$, importFailures$ };
};

const createMissingEvernoteNotebooksAsCollections = (
  evernoteNotes$: Observable<Link[]>
) => {
  const existingCollections$ = getAllCollections().pipe(map(mapCollections));
  const requiredCollections$ = evernoteNotes$.pipe(
    map(
      (notes: Link[]) =>
        new Set([...notes.map((note) => note.notebook)].filter(Boolean))
    )
  );

  const collections$ = combineLatest([
    existingCollections$,
    requiredCollections$,
  ]).pipe(
    switchMap((collections) =>
      from(confirmImport()).pipe(
        take(1),
        map((answer) => {
          if (answer.confirmStart === false) {
            process.exit(1);
          }

          return collections;
        })
      )
    ),
    map(([existingCollections, requiredCollections]) => {
      const existingNames = existingCollections.map(
        (collection) => collection.name
      );
      const missingCollections = difference(
        [...requiredCollections],
        existingNames
      );

      if (missingCollections.length > 0) {
        log.info(
          `The following collections do not exist in raindrop.io and will be created: "${missingCollections.join(
            ", "
          )}"`
        );
      } else {
        log.info(
          "All notebooks in Evernote have matching collections in raindrops.io"
        );
      }

      return missingCollections;
    }),
    switchMap((collections) => {
      if (collections.length > 0) {
        return forkJoin(
          collections.map((collection) => {
            log.info(`Creating collection "${collection}" on raindrop.io`);
            return createCollection(collection as string);
          })
        );
      } else {
        return of([]);
      }
    }),
    tap((collections) => {
      for (const collection of collections) {
        log.info(
          `Successfully created collection "${collection.title}" with id "${collection._id}"`
        );
      }
      if (collections.length > 0) {
        log.debug(
          `Created collection-ids "${collections.map((col) => col._id)}"`
        );
      }
    }),
    switchMap(() => getAllCollections()),
    map((collections) => {
      const collectionsMap = new Map<string, number>();
      for (const collection of collections) {
        collectionsMap.set(collection.title, collection._id);
      }

      return collectionsMap;
    }),
    share()
  );

  return { collections$ };
};

const createRaindrops = (
  collections$: Observable<Map<string, number>>,
  evernoteNotes$: Observable<Required<Link, "uri">[]>
) => {
  const import$: Observable<Raindrop[]> = combineLatest([
    collections$,
    evernoteNotes$,
  ]).pipe(
    tap(([, notes]) => log.info(`Importing ${notes.length} Notes`)),
    map(([collectionsMap, notes]): Raindrop[] =>
      notes.map((note) => ({
        collectionId: collectionsMap.get(note.notebook) as number,
        created: convertDateToIso(note.created),
        link: note.uri,
        title: note.title,
        ...(!!note.tags?.length ? { tags: note.tags } : {}),
      }))
    ),
    concatMap((x) => x), // * spread out the array-values into individual emits
    bufferCount(100),
    concatMap((idChunk) => of(idChunk).pipe(delay(3000))),
    tap((idChunk) => log.info(`Creating a batch of ${idChunk.length} notes`)),
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

  return { import$ };
};

(async function () {
  const selection = await getImportConfig();

  log.debug("Import-Selection:", selection);

  const targetedNotebooks: TargetedNotebooks = {
    ...(selection.target === "names" ? { names: selection.selectedNames } : {}),
    ...(selection.target === "stacks"
      ? { stacks: selection.selectedStacks }
      : {}),
  };

  const { importSuccess$, importFailures$ } = setupLogOutput();

  const evernoteNotes$ = importNotes(targetedNotebooks).pipe(
    map(filterInvalidNotes(importFailures$)),
    share()
  );

  const { collections$ } = createMissingEvernoteNotebooksAsCollections(
    evernoteNotes$
  );

  const { import$ } = createRaindrops(collections$, evernoteNotes$);

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
})();
