import {
  forkJoin,
  from,
  Observable,
  ObservableInput,
  ObservedValueOf,
  of,
  OperatorFunction,
  pipe,
  throwError,
} from "rxjs";
import {
  bufferCount,
  catchError,
  concatMap,
  delay,
  filter,
  switchMap,
  tap,
} from "rxjs/operators";
import { log } from "./logger";

/**
 *
 * @param tag
 * @see https://netbasal.com/creating-custom-operators-in-rxjs-32f052d69457
 */
export function debug(tag: string) {
  return tap({
    next(value) {
      log.debug(
        `%c[${tag}: Next]`,
        "background: #009688; color: #fff; padding: 3px; font-size: 9px;",
        value
      );
    },
    error(error) {
      log.debug(
        `%[${tag}: Error]`,
        "background: #E91E63; color: #fff; padding: 3px; font-size: 9px;",
        error
      );
    },
    complete() {
      log.debug(
        `%c[${tag}]: Complete`,
        "background: #00BCD4; color: #fff; padding: 3px; font-size: 9px;"
      );
    },
  });
}

// TODO: Error handling when chunk fails
export function batchAndDelay<T, R>(
  project: (value: T[], index: number) => Observable<R[]>,
  chunkSize: number,
  delayBetweenChunks: number = 0,
  tag: string = "",
  collectionSize?: number
): OperatorFunction<T, R> {
  return pipe(
    bufferCount(chunkSize),
    concatMap((chunk, index) =>
      of(chunk).pipe(
        tap(() => {
          const progress = collectionSize
            ? `${index + 1}/${Math.ceil(collectionSize / chunkSize)}`
            : "";
          log.info(`${tag ? `[${tag}]:` : ""} Process chunk ${progress}`);
        }),
        switchMap(project),
        delay(delayBetweenChunks)
      )
    ),
    concatMap((x) => x)
  );
}
