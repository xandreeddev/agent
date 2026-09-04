import { Match, Option } from "effect"
import type { SelectOption } from "./selectBox.js"
import type { WorkspaceView } from "./workspace.js"

/**
 * The dashboard as a MENU — every row on the idle screen is something you
 * can act on, not a readout. Pure: rows derive from the workspace view in
 * display order; focus is one index over them (Tab focuses, ↑/↓ move, ⏎
 * opens the row's actions, Esc or typing hands the keys back to the
 * composer); each row kind declares its actions for the ONE select overlay.
 * The runtime executes; nothing here touches a service.
 */

export type DashboardRow =
  | {
      readonly kind: "spec"
      readonly slug: string
      readonly status: "draft" | "locked"
      readonly goal: string
    }
  | { readonly kind: "run"; readonly id: string; readonly text: string; readonly accepted: boolean }
  | { readonly kind: "session"; readonly id: string; readonly label: string }
  | { readonly kind: "lesson"; readonly text: string }

export type FocusDirection = "up" | "down"

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`

/** Specs, then runs, then sessions, then lessons — the screen's order. */
export const dashboardRows = (view: WorkspaceView): ReadonlyArray<DashboardRow> => [
  ...view.specs.map((s) => ({
    kind: "spec" as const,
    slug: s.slug,
    status: s.status,
    goal: s.goal,
  })),
  ...view.runs.map((r) => ({ kind: "run" as const, id: r.id, text: r.text, accepted: r.accepted })),
  ...view.sessions.map((s) => ({ kind: "session" as const, id: s.id, label: s.label })),
  ...view.lessons.map((text) => ({ kind: "lesson" as const, text })),
]

/** Row identity for the `:open` picker — specs by slug, runs and sessions by
 *  id, lessons by position (they have no id of their own). */
export const rowKey = (row: DashboardRow, index: number): string =>
  Match.value(row).pipe(
    Match.when({ kind: "spec" }, (r) => `spec:${r.slug}`),
    Match.when({ kind: "run" }, (r) => `run:${r.id}`),
    Match.when({ kind: "session" }, (r) => `session:${r.id}`),
    Match.when({ kind: "lesson" }, () => `lesson:${index}`),
    Match.exhaustive,
  )

export const findRow = (
  rows: ReadonlyArray<DashboardRow>,
  key: string,
): Option.Option<DashboardRow> =>
  Option.fromNullable(rows.find((row, index) => rowKey(row, index) === key))

/** ↑/↓ over `count` rows, clamped at the ends (the list is short and both
 *  ends are on screen — wrapping reads as a jump). Entering from nowhere
 *  lands on the first row going down, the last going up. */
export const moveFocus = (
  count: number,
  focus: Option.Option<number>,
  direction: FocusDirection,
): Option.Option<number> => {
  if (count === 0) return Option.none()
  const step = direction === "down" ? 1 : -1
  const from = Option.getOrElse(focus, () => (direction === "down" ? -1 : count))
  return Option.some(Math.min(count - 1, Math.max(0, from + step)))
}

/** The row as an `:open` picker option — label to filter on, its kind (or a
 *  spec's status) as the tag, a spec's goal as the description. */
export const rowOption = (row: DashboardRow, index: number): SelectOption<Option.Option<string>> =>
  Match.value(row).pipe(
    Match.when({ kind: "spec" }, (r) => ({
      value: Option.some(rowKey(r, index)),
      label: r.slug,
      tag: r.status,
      desc: r.goal,
    })),
    Match.when({ kind: "run" }, (r) => ({
      value: Option.some(rowKey(r, index)),
      label: r.text,
      tag: "run",
    })),
    Match.when({ kind: "session" }, (r) => ({
      value: Option.some(rowKey(r, index)),
      label: r.label,
      tag: "session",
    })),
    Match.when({ kind: "lesson" }, (r) => ({
      value: Option.some(rowKey(r, index)),
      label: clip(r.text, 64),
      tag: "lesson",
    })),
    Match.exhaustive,
  )

/** The action menu's title — what you are acting on. */
export const rowTitle = (row: DashboardRow): string =>
  Match.value(row).pipe(
    Match.when({ kind: "spec" }, (r) => `spec ${r.slug} — ${r.status}`),
    Match.when({ kind: "run" }, (r) => `forge run — ${clip(r.text, 60)}`),
    Match.when({ kind: "session" }, (r) => `session — ${r.label}`),
    Match.when({ kind: "lesson" }, () => "lesson"),
    Match.exhaustive,
  )

export type RowAction =
  | "open"
  | "lock"
  | "forge"
  | "delete"
  | "report"
  | "follow-up"
  | "resume"
  | "show"

const action = (value: RowAction, label: string, desc: string): SelectOption<Option.Option<string>> => ({
  value: Option.some(value),
  label,
  desc,
})

/** What each row kind can do — the verbs the runtime implements. */
export const rowActions = (row: DashboardRow): ReadonlyArray<SelectOption<Option.Option<string>>> =>
  Match.value(row).pipe(
    Match.when({ kind: "spec", status: "locked" }, () => [
      action("forge", "forge", "build it under the gates (:forge)"),
      action("open", "open", "view it in the spec panel"),
      action("delete", "delete", "remove the spec file"),
    ]),
    Match.when({ kind: "spec" }, () => [
      action("open", "open", "refine it in the composer"),
      action("lock", "lock", "approve it as-is (:lock)"),
      action("delete", "delete", "remove the spec file"),
    ]),
    Match.when({ kind: "run" }, () => [
      action("report", "report", "replay the attempts and verdicts into the floor"),
      action("follow-up", "follow up", "continue the coder's conversation — full context, no gates"),
    ]),
    Match.when({ kind: "session" }, () => [
      action("resume", "resume", "load it into this session (:resume)"),
    ]),
    Match.when({ kind: "lesson" }, () => [
      action("show", "show", "the whole lesson on the notice line"),
    ]),
    Match.exhaustive,
  )
