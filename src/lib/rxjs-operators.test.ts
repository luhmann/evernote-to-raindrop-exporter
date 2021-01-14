import { defer, forkJoin, of, throwError, timer } from "rxjs";
import { map, switchMap, take } from "rxjs/operators";
import { TestScheduler } from "rxjs/testing";
import { batchAndDelay, retryRequests } from "./rxjs-operators";

const getTestScheduler = () => {
  const testScheduler = new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });

  return { testScheduler };
};

describe(batchAndDelay.name, () => {
  test("separates input in chunks of the specified size, delays execution by the specified time and emits as individual values", () => {
    const { testScheduler } = getTestScheduler();
    testScheduler.run(({ cold, expectObservable }) => {
      const input$ = cold("-a-b-c-d-e-f", {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 5,
        f: 6,
      });
      const subject$ = input$.pipe(
        batchAndDelay(
          (inputs) =>
            forkJoin(
              inputs.map((input) =>
                timer(input * 1000).pipe(
                  take(1),
                  switchMap(() => of(input * 2))
                )
              )
            ),
          2,
          1_000
        )
      );

      // ? 1) the longest of the batched async operation (b) takes 2s, after both results are emitted sync
      // ? 2) the delay is less than the specified `1s`, because the `(cd)`-syntax counts as 4 frames but it is in fact only one
      // ? 2) so the delay we need to use is 1_000 frames - 4 frames = 996ms (shortcoming of rxjs marble-testing)
      // ? 3) `d` and `f` are increasingly longer async operations which increase the delay
      // ?                   1v       2v   3v            3v
      const expected$ = "--- 2s (ab) 996ms 4s (cd) 996ms 6s (ef)";
      expectObservable(subject$).toBe(expected$, {
        a: 2,
        b: 4,
        c: 6,
        d: 8,
        e: 10,
        f: 12,
      });
    });
  });
});

describe(retryRequests.name, () => {
  test("when the passed predicate returns a delay, then the operation is retried after the amount of time in ms", () => {
    const { testScheduler } = getTestScheduler();

    testScheduler.run(({ expectObservable, flush }) => {
      const logFn = jest.fn();
      const errorApiResponse = { status: 409, retryDelay: 1000 };
      const resultProvider = jest
        .fn()
        .mockImplementationOnce(() => throwError(errorApiResponse))
        .mockImplementationOnce(() => of({ status: 200, body: "Worked" }));

      const retryPredicate = (err: any) =>
        err.status === 409 ? err.retryDelay : false;

      const subject$ = defer(() => resultProvider()).pipe(
        retryRequests(retryPredicate, logFn),
        map((result: any) => result.body)
      );

      const expected$ = " 1s (a|)";
      expectObservable(subject$).toBe(expected$, { a: "Worked" });

      flush();
      expect(logFn).toHaveBeenCalledWith(errorApiResponse);
    });
  });

  test("when the predicate determines no retry should be attempted, then the error is emitted immediately", () => {
    const { testScheduler } = getTestScheduler();

    testScheduler.run(({ expectObservable, flush }) => {
      const logFn = jest.fn();
      const errorApiResponse = {
        status: 503,
        errorCode: "An internal server error occured",
      };
      const resultProvider = jest
        .fn()
        .mockImplementationOnce(() => throwError(errorApiResponse));

      const retryPredicate = (err: any) =>
        err.status === 409 ? err.retryDelay : false;

      const subject$ = defer(() => resultProvider()).pipe(
        retryRequests(retryPredicate, logFn),
        map((result: any) => result.body)
      );

      const expected$ = "#";
      expectObservable(subject$).toBe(expected$, undefined, errorApiResponse);

      flush();
      expect(logFn).toHaveBeenCalledWith(errorApiResponse);
    });
  });

  test("when the maximum number of retries is exceeded, then the error is emitted", () => {
    const { testScheduler } = getTestScheduler();

    testScheduler.run(({ expectObservable, flush }) => {
      const logFn = jest.fn();
      const errorApiResponse = {
        status: 409,
        errorCode: "You have hit the ratelimit",
        retryDelay: 1000,
      };
      const resultProvider = jest.fn(() => throwError(errorApiResponse));

      const retryPredicate = (err: any) =>
        err.status === 409 ? err.retryDelay : false;

      const subject$ = defer(() => resultProvider()).pipe(
        retryRequests(retryPredicate, logFn, 2),
        map((result: any) => result.body)
      );

      const expected$ = " 1s 1s #";
      expectObservable(subject$).toBe(expected$, undefined, errorApiResponse);

      flush();
      expect(logFn).toHaveBeenCalledWith(errorApiResponse);
    });
  });
});
