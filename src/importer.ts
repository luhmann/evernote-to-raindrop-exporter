import { ReplaySubject, Subject } from "rxjs";
import { map, reduce, share } from "rxjs/operators";
import { importNotes, TargetedNotebooks } from "./lib/evernote";
import { log } from "./lib/logger";
import {
  createMissingCollections,
  createRaindrops,
  RaindropLink,
} from "./lib/raindrops";
import { Raindrop } from "./lib/raindrops-api";
import { getEvernoteWebLink, Link } from "./lib/util";

enum ImportFailureReason {
  NO_LINK = "Note is missing URI, currently only links are supported by this script.",
}

type ImportFailure = {
  note: Link;
  reason: ImportFailureReason;
};

const filterInvalidNotes = (importFailures$: Subject<ImportFailure>) => (
  notes: Link[]
): RaindropLink[] =>
  notes.filter((note): note is RaindropLink => {
    const shouldInclude = Boolean(note.uri);

    if (!shouldInclude) {
      importFailures$.next({ note, reason: ImportFailureReason.NO_LINK });
    }

    return shouldInclude;
  });

const setupLogOutput = () => {
  const importFailures$ = new ReplaySubject<ImportFailure>();
  const importSuccess$ = new ReplaySubject<Raindrop>();

  const importSuccessMessages$ = importSuccess$.pipe(share());

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
          `Notebook: ${failure.note.notebook}`,
          getEvernoteWebLink(failure.note.notebookId, failure.note.id) ??
            failure.note.notebookId,
        ])
      );
    });

  return { importSuccess$, importFailures$ };
};

export async function run(targetedNotebooks: TargetedNotebooks) {
  const { importSuccess$, importFailures$ } = setupLogOutput();

  const evernoteNotes$ = importNotes(targetedNotebooks).pipe(
    map(filterInvalidNotes(importFailures$)),
    share()
  );
  const { collections$ } = createMissingCollections(evernoteNotes$);
  const { import$ } = createRaindrops(collections$, evernoteNotes$);

  import$.subscribe(
    (note) => {
      importSuccess$.next(note);
    },
    (err) => log.fatal("Import failed without recovery", err),
    () => {
      log.info("Import successfully completed");
      importSuccess$.complete();
      importFailures$.complete();
    }
  );
}
