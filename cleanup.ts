import { defer, forkJoin, from, of } from "rxjs";
import {
  bufferCount,
  catchError,
  concatMap,
  delay,
  last,
  switchMap,
  tap,
} from "rxjs/operators";
import { log } from "./src/lib/logger";
import { deleteCollections, deleteRaindrop } from "./src/lib/raindrops";

const raindropIds = [1];

const collectionIds = [1];

// TODO: we do not need to clean the raindrops indivudally that are in collections we completely created
// from scratch ... delete collections first and filter the raindrops from those from the list
const deleteRaindrops$ = from(raindropIds).pipe(
  bufferCount(120),
  tap((chunk) => log.info("Processing note chunk", chunk)),
  concatMap((idChunk, index) =>
    of(idChunk).pipe(delay(index === 0 ? 0 : 60_000))
  ), // ? API asks to respect a 120 rpm limit
  switchMap((idChunk) =>
    // * this avoids the hot cold problem pointed out below because the requests are
    // * created within the observable chain
    forkJoin(idChunk.map((id) => deleteRaindrop(id))).pipe(
      catchError((err) => {
        log.error(err);
        return of([]);
      })
    )
  ),
  tap(() => log.info("Processed note chunk"))
);

// * rxjs `from` a promise executes the promise immediately as it returns a hot observable
// * the value of the resolved promise is then shared between subscribers
// * `defer` turns it into a cold observable that is only executed when the observable is subscribed to
// @see https://stackoverflow.com/a/54111045
const deleteCollections$ = defer(() => deleteCollections(collectionIds)).pipe(
  catchError((err) => {
    log.info(err);
    return of(err.message);
  }),
  tap(() => log.info("Deleted Collections"))
);

// * this completely exhausts `deleteRaindrops$` (it will be completed) before executing `deleteCollections`
deleteRaindrops$
  .pipe(
    last(),
    concatMap(() => deleteCollections$)
  )
  .subscribe();
