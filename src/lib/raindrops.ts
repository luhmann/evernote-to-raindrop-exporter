import { difference } from "remeda";
import {
  Observable,
  combineLatest,
  of,
  BehaviorSubject,
  forkJoin,
  from,
} from "rxjs";
import {
  tap,
  switchMap,
  map,
  concatMap,
  catchError,
  share,
  take,
} from "rxjs/operators";
import type { Required } from "utility-types";
import { confirmImport } from "./cli";
import { config } from "./config";
import { log } from "./logger";
import {
  Raindrop,
  batchCreateRaindrops,
  createCollection,
  getAllCollections,
  mapCollections,
} from "./raindrops-api";
import { batchAndDelay } from "./rxjs-operators";
import { Link, convertDateToIso } from "./util";

export const createMissingCollections = (srcNotes$: Observable<Link[]>) => {
  const totalNotes$ = new BehaviorSubject<number>(0);
  const existingCollections$ = getAllCollections().pipe(map(mapCollections));
  const requiredCollections$ = srcNotes$.pipe(
    tap((notes) => {
      totalNotes$.next(notes.length);
    }),
    map(
      (notes: Link[]) =>
        new Set([...notes.map((note) => note.notebook)].filter(Boolean))
    )
  );

  const collections$ = combineLatest([
    existingCollections$,
    requiredCollections$,
  ]).pipe(
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
    tap((collections) =>
      log.info(
        `You are about to create ${
          collections.length
            ? collections.length + " new collection(s) and "
            : ""
        }${totalNotes$.value} new links on raindrop.io.`
      )
    ),
    switchMap((collections) =>
      from(confirmImport()).pipe(
        take(1),
        map((answer) => {
          if (answer.confirmStart === true) {
            return collections;
          }

          process.exit(0);
        })
      )
    ),
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
        log.debug(
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

export type RaindropLink = Required<Link, "uri">;

const mapLinkToRaindrop = ([collectionsMap, notes]: [
  Map<string, number>,
  RaindropLink[]
]): Raindrop[] =>
  notes.map((note) => ({
    collectionId: collectionsMap.get(note.notebook) as number,
    created: convertDateToIso(note.created),
    link: note.uri,
    title: note.title,
    ...(!!note.tags?.length ? { tags: note.tags } : {}),
  }));

export const createRaindrops = (
  collections$: Observable<Map<string, number>>,
  srcLinks$: Observable<RaindropLink[]>
) => {
  const import$: Observable<Raindrop> = combineLatest([
    collections$,
    srcLinks$,
  ]).pipe(
    tap(([, raindrops]) => log.info(`Importing ${raindrops.length} Raindrops`)),
    map(mapLinkToRaindrop),
    switchMap((raindrops) => {
      const totalRaindrops = raindrops.length;
      return of(raindrops).pipe(
        concatMap((x) => x), // * spread out the array-values into individual emits
        batchAndDelay<Raindrop, Raindrop>(
          (chunk) =>
            batchCreateRaindrops(chunk).pipe(
              catchError((err) => {
                log.error("Failure while creating batch of raindrops", err);
                return of([]);
              })
            ),
          config.RAINDROPS_API_BATCH_SIZE,
          config.RAINDROPS_API_DELAY,
          "Raindrops",
          totalRaindrops
        )
      );
    }),
    share()
  );

  return { import$ };
};
