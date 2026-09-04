import { describe, expect, test } from "bun:test"
import { Effect, Layer, Option } from "effect"
import type { LedgerEntry } from "../domain/ledger.entity.js"
import { DEFAULT_POLICY } from "../domain/social-policy.entity.js"
import { SocialWorkspace } from "../ports/social-workspace.port.js"
import { XPlatform } from "../ports/x-platform.port.js"
import { approveDraft, parseDraft, ReviewError } from "./reviewQueue.js"
import type { DraftMetadata } from "./reviewQueue.js"

const draft = (over: Partial<DraftMetadata> = {}): DraftMetadata => ({
  type: Option.some("reply"),
  targetTweetId: Option.some("111"),
  targetAuthor: Option.some("@someone"),
  referenceBlogSlug: Option.some("effect-retries"),
  content:
    "Concrete answer: model the retry as a Schedule and compose it. https://xandreed.dev/posts/effect-retries",
  filePath: "/queue/pending/one.md",
  filename: "one.md",
  ...over,
})

/** The two ports as scripted doubles: every ledger append and every post
 *  is recorded; either can be told to fail. */
const world = (opts: { readonly ledgerFails?: boolean; readonly postFails?: boolean; readonly ledger?: ReadonlyArray<LedgerEntry> } = {}) => {
  const rows: Array<LedgerEntry> = []
  const posts: Array<string> = []
  const archived: Array<string> = []
  const layer = Layer.mergeAll(
    Layer.succeed(SocialWorkspace, {
      readLedger: () => Effect.succeed([...(opts.ledger ?? []), ...rows]),
      appendLedger: (_path, entry) =>
        opts.ledgerFails === true
          ? Effect.fail({ _tag: "LedgerError" as const, message: "disk full" })
          : Effect.sync(() => {
              rows.push(entry)
            }),
      loadPolicy: () => Effect.succeed(DEFAULT_POLICY),
      writeDraft: () => Effect.void,
    }),
    Layer.succeed(XPlatform, {
      search: () => Effect.succeed([]),
      getNotifications: () => Effect.succeed([]),
      readThread: () => Effect.succeed([]),
      postTweet: (text) =>
        opts.postFails === true
          ? Effect.fail(new Error("X said 403"))
          : Effect.sync(() => {
              posts.push(text)
            }),
    }),
  )
  const archive = (d: DraftMetadata) =>
    Effect.sync(() => {
      archived.push(d.filename)
    })
  return { rows, posts, archived, layer, archive }
}

const approve = (w: ReturnType<typeof world>, d: DraftMetadata = draft()) =>
  Effect.runPromise(
    approveDraft(d, { knownSlugs: new Set(["effect-retries"]), archive: w.archive }).pipe(
      Effect.provide(w.layer),
    ),
  )

describe("approveDraft — the order is the double-post defence", () => {
  test("happy path: the posting intent lands BEFORE the platform call; posted and the archive follow", async () => {
    const w = world()
    const outcome = await approve(w)
    expect(outcome).toEqual({ _tag: "posted", archived: true })
    expect(w.rows.map((r) => r.event)).toEqual(["posting", "posted"])
    expect(w.posts).toHaveLength(1)
    expect(w.archived).toEqual(["one.md"])
  })

  test("the ledger refusing the intent row means NO post — fail-closed", async () => {
    const w = world({ ledgerFails: true })
    const outcome = await approve(w)
    expect(outcome._tag).toBe("ledger-refused")
    expect(w.posts).toEqual([])
  })

  test("a refused post leaves `posting` + `post_failed` — the target is free for a retry, the draft stays", async () => {
    const w = world({ postFails: true })
    const outcome = await approve(w)
    expect(outcome._tag).toBe("post-failed")
    expect(w.rows.map((r) => r.event)).toEqual(["posting", "post_failed"])
    expect(w.rows[1]?.findings).toEqual(["X said 403"])
    expect(w.archived).toEqual([])
  })

  test("a `posting` intent already on the ledger for the target BLOCKS a second approval (the crash-mid-post case)", async () => {
    const w = world({
      ledger: [
        { at: new Date().toISOString(), event: "posting", kind: "reply", targetTweetId: "111", targetAuthor: "@someone" },
      ],
    })
    const outcome = await approve(w)
    expect(outcome._tag).toBe("blocked")
    expect(outcome._tag === "blocked" && outcome.findings.map((f) => f.rule)).toContain("dedup")
    expect(w.posts).toEqual([])
  })

  test("an unlabeled draft never leaves, and never touches the ledger", async () => {
    const w = world()
    const outcome = await approve(w, draft({ type: Option.none() }))
    expect(outcome).toEqual({ _tag: "unlabeled" })
    expect(w.posts).toEqual([])
    expect(w.rows).toEqual([])
  })

  test("a failed archive after a successful post is reported, not hidden — and the ledger still says posted", async () => {
    const w = world()
    const outcome = await Effect.runPromise(
      approveDraft(draft(), {
        knownSlugs: new Set(["effect-retries"]),
        archive: () => Effect.fail(new ReviewError({ message: "EACCES" })),
      }).pipe(Effect.provide(w.layer)),
    )
    expect(outcome).toEqual({ _tag: "posted", archived: false })
    expect(w.rows.map((r) => r.event)).toEqual(["posting", "posted"])
  })
})

describe("parseDraft — the frontmatter is the label", () => {
  test("a draft without `type:` is UNLABELED (never a silent top-level post); a labeled one round-trips", () => {
    const unlabeled = parseDraft("---\ntargetTweetId: 1\n---\nhello", "/p/a.md", "a.md")
    expect(Option.isNone(unlabeled.type)).toBe(true)
    expect(unlabeled.content).toBe("hello")
    const labeled = parseDraft(
      '---\ntype: "reply"\ntargetTweetId: "22"\ntargetAuthor: "@bob"\nreferenceBlogSlug: null\n---\nhi bob',
      "/p/b.md",
      "b.md",
    )
    expect(labeled.type).toEqual(Option.some("reply"))
    expect(labeled.targetTweetId).toEqual(Option.some("22"))
    expect(labeled.targetAuthor).toEqual(Option.some("@bob"))
    expect(Option.isNone(labeled.referenceBlogSlug)).toBe(true)
  })
})
