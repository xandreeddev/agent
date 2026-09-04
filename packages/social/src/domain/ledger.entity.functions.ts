import type { LedgerEntry } from "./ledger.entity.js"

/** Rows that did NOT engage the target: a skip, a gate bounce, a post the
 *  platform refused. Everything else — drafted, queued, posting, posted —
 *  means the tweet is spoken for. */
const NOT_ENGAGED: ReadonlySet<LedgerEntry["event"]> = new Set([
  "skipped",
  "gate_rejected",
  "post_failed",
])

export const engagedTweetIds = (entries: ReadonlyArray<LedgerEntry>): ReadonlySet<string> =>
  new Set(
    entries
      .filter((entry) => entry.targetTweetId !== undefined && !NOT_ENGAGED.has(entry.event))
      .map((entry) => entry.targetTweetId as string),
  )

/** Posted OR mid-post: an intent row counts against every cap the moment it
 *  is written, so a crash between the row and the platform can never be
 *  followed by a second post that the caps would have allowed. */
const COUNTS_AS_POSTED: ReadonlySet<LedgerEntry["event"]> = new Set(["posting", "posted"])

export const postedInWindow = (
  entries: ReadonlyArray<LedgerEntry>,
  now: Date,
  windowMs: number,
): ReadonlyArray<LedgerEntry> =>
  entries.filter(
    (entry) => COUNTS_AS_POSTED.has(entry.event) && now.getTime() - Date.parse(entry.at) < windowMs,
  )

/** `@Someone`, `someone`, `SOMEONE` — one author. The model writes handles
 *  bare, the ledger stores them as the platform showed them. */
export const normalizeAuthor = (author: string): string =>
  author.trim().toLowerCase().replace(/^@/, "")

export const postedToAuthor = (
  entries: ReadonlyArray<LedgerEntry>,
  author: string,
): ReadonlyArray<LedgerEntry> =>
  entries.filter(
    (entry) =>
      COUNTS_AS_POSTED.has(entry.event) &&
      entry.targetAuthor !== undefined &&
      normalizeAuthor(entry.targetAuthor) === normalizeAuthor(author),
  )
