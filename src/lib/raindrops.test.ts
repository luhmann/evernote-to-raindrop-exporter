import { of } from "rxjs";
import { rest } from "msw";
import { mockNotebooks } from "../mocks/fixtures/evernote";
import { getLinks } from "../mocks/fixtures/links";
import { resetRaindropMocks } from "../mocks/raindrops";
import { server } from "../mocks/server";
import { config } from "./config";
import { createMissingCollections, createRaindrops } from "./raindrops";
import { createRaindropClient } from "./raindrops-api";
import { getCollections } from "../mocks/fixtures/raindrops";
import { bufferCount } from "rxjs/operators";

beforeEach(() => {
  createRaindropClient();
  resetRaindropMocks();
});

describe(createMissingCollections.name, () => {
  test("when a list of links is passed, then the collections missing on raindrop.io are created and a map of collections and their ids is returned", (done) => {
    const srcNotes$ = of(getLinks(3_000));

    const { collections$ } = createMissingCollections(srcNotes$);

    collections$.subscribe((collectionsMap) => {
      expect(collectionsMap.get(mockNotebooks.NO_STACK_2)).toEqual(
        jasmine.any(Number)
      );
      expect(collectionsMap.get(mockNotebooks.STACK_2)).toEqual(
        jasmine.any(Number)
      );
      done();
    });
  });
});

describe(createRaindrops.name, () => {
  test("when a list of links is provided, they are created within the correct collections on raidrop.io and the list of created notes is returned", (done) => {
    expect.hasAssertions();
    const collectionsMap = new Map(
      getCollections().map((collection) => [collection.title, collection._id])
    );
    const links = getLinks(3_000);

    const { import$ } = createRaindrops(of(collectionsMap), of(links));

    import$.pipe(bufferCount(3000)).subscribe((createdLinks) => {
      expect(createdLinks.map((link) => link.title)).toEqual(
        jasmine.arrayContaining(links.map((link) => link.title))
      );
      done();
    });
  });
});

describe("Error-Handling", () => {
  test("when a request fails with a non-rate-limit-error, then it is retried", (done) => {
    server.use(
      rest.get(`${config.RAINDROPS_API_URL}/collections`, (req, res, ctx) => {
        return res.once(
          ctx.status(503),
          ctx.json({ message: "Internal server error" })
        );
      })
    );

    const srcNotes$ = of(getLinks(500));

    const { collections$ } = createMissingCollections(srcNotes$);

    collections$.subscribe((collectionsMap) => {
      expect(collectionsMap.get(mockNotebooks.NO_STACK_2)).toEqual(
        jasmine.any(Number)
      );
      expect(collectionsMap.get(mockNotebooks.STACK_2)).toEqual(
        jasmine.any(Number)
      );
      done();
    });
  });

  test("when a request returns a rate-limit-error, then it should retry after the prescribed time", (done) => {
    server.use(
      rest.get(`${config.RAINDROPS_API_URL}/collections`, (req, res, ctx) => {
        return res.once(
          ctx.status(429),
          ctx.set("X-RateLimit-Reset", String(+Date.now() + 500)),
          ctx.json({ message: "Too many requests" })
        );
      })
    );

    const srcNotes$ = of(getLinks(500));

    const { collections$ } = createMissingCollections(srcNotes$);

    collections$.subscribe((collectionsMap) => {
      expect(collectionsMap.get(mockNotebooks.NO_STACK_2)).toEqual(
        jasmine.any(Number)
      );
      expect(collectionsMap.get(mockNotebooks.STACK_2)).toEqual(
        jasmine.any(Number)
      );
      done();
    });
  });
});
