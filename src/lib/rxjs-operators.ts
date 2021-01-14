import evernote from "evernote";
import {
  MonoTypeOperatorFunction,
  Observable,
  of,
  OperatorFunction,
  pipe,
  timer,
} from "rxjs";
import {
  bufferCount,
  concatMap,
  delay,
  delayWhen,
  map,
  mergeMap,
  retryWhen,
  switchMap,
  take,
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

/**
 * Takes in a stream, chunks the emissions in configured pieces and processes them serially.
 *
 * Intended to be used when you make a lot of calls against a rate-limited API or just want to be considerate.
 *
 * @note Error-Handling needs to be done within the observable that is returned from `project`
 * @param project
 * @param chunkSize
 * @param delayBetweenChunks
 * @param tag
 * @param collectionSize
 */
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
        delay(index === 0 ? 0 : delayBetweenChunks)
      )
    ),
    concatMap((x) => x)
  );
}

export function retryRequests<T>(
  retryPredicate: (err: any) => number | false,
  loggingFunction?: (err: any) => void,
  maxRetries = 5
): MonoTypeOperatorFunction<T> {
  return pipe(
    retryWhen((input) =>
      input.pipe(
        mergeMap((error, attempt) => {
          if (loggingFunction) {
            loggingFunction(error);
          }

          const durationOrAbort = retryPredicate(error);

          if (durationOrAbort === false || attempt >= maxRetries) {
            if (attempt > maxRetries) {
              log.error("Exceeded maximum number of retries");
            }
            throw error;
          }

          log.info(`Retrying failing request in "${durationOrAbort}ms"`);

          return timer(durationOrAbort);
        })
      )
    )
  );
}
