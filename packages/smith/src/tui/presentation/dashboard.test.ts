import { describe, expect, test } from "bun:test"
import { Option } from "effect"
import {
  dashboardRows,
  findRow,
  moveFocus,
  rowActions,
  rowKey,
  rowOption,
  rowTitle,
} from "./dashboard.js"
import type { WorkspaceView } from "./workspace.js"

const view: WorkspaceView = {
  specs: [
    { slug: "stats-module", status: "locked", goal: "A stats module with tests." },
    { slug: "cli-flags", status: "draft", goal: "Parse the flags." },
  ],
  runs: [{ id: "22222222-2222-4222-8222-222222222222", text: "✓ accepted (attempt 1) · stats", accepted: true }],
  lessons: ["never call the same tool twice with the same args"],
  providers: [],
  sessions: [{ id: "33333333-3333-4333-8333-333333333333", label: "stats session", ageMinutes: 5 }],
  unconfigured: false,
}

describe("the dashboard as a menu", () => {
  test("rows follow the screen's order and carry a stable key each", () => {
    const rows = dashboardRows(view)
    expect(rows.map((r) => r.kind)).toEqual(["spec", "spec", "run", "session", "lesson"])
    expect(rows.map(rowKey)).toEqual([
      "spec:stats-module",
      "spec:cli-flags",
      "run:22222222-2222-4222-8222-222222222222",
      "session:33333333-3333-4333-8333-333333333333",
      "lesson:4",
    ])
    expect(Option.map(findRow(rows, "spec:cli-flags"), (r) => r.kind)).toEqual(Option.some("spec"))
    expect(Option.isNone(findRow(rows, "spec:nope"))).toBe(true)
  })

  test("focus moves ↑/↓ within the rows and clamps at both ends", () => {
    expect(moveFocus(0, Option.none(), "down")).toEqual(Option.none())
    expect(moveFocus(3, Option.none(), "down")).toEqual(Option.some(0))
    expect(moveFocus(3, Option.none(), "up")).toEqual(Option.some(2))
    expect(moveFocus(3, Option.some(0), "up")).toEqual(Option.some(0))
    expect(moveFocus(3, Option.some(2), "down")).toEqual(Option.some(2))
    expect(moveFocus(3, Option.some(1), "down")).toEqual(Option.some(2))
  })

  test("each row kind declares its own verbs; a locked spec forges, a draft locks", () => {
    const rows = dashboardRows(view)
    const verbs = (i: number) => rowActions(rows[i]!).map((o) => Option.getOrThrow(o.value))
    expect(verbs(0)).toEqual(["forge", "open", "delete"])
    expect(verbs(1)).toEqual(["open", "lock", "delete"])
    expect(verbs(2)).toEqual(["report", "follow-up"])
    expect(verbs(3)).toEqual(["resume"])
    expect(verbs(4)).toEqual(["show"])
    expect(rowTitle(rows[0]!)).toBe("spec stats-module — locked")
    expect(rowTitle(rows[3]!)).toBe("session — stats session")
  })

  test("picker options filter on the label and tag the kind (specs tag their status)", () => {
    const rows = dashboardRows(view)
    const options = rows.map(rowOption)
    expect(options.map((o) => o.tag)).toEqual(["locked", "draft", "run", "session", "lesson"])
    expect(options[0]?.label).toBe("stats-module")
    expect(options[0]?.desc).toBe("A stats module with tests.")
    expect(options[2]?.label).toContain("accepted")
  })
})

describe("the dashboard menu — the context set's rows", () => {
  test("standing sources and pins sit between sessions and lessons, with toggle/remove verbs", () => {
    const rows = dashboardRows(view, {
      standing: [
        { name: "rules", on: true, chars: 2_100 },
        { name: "lessons", on: false, chars: 300 },
      ],
      pins: [{ index: 0, label: "src/x.ts", kind: "file", on: true, status: "included", chars: 3_200 }],
      pinChars: 3_200,
      standingChars: 2_100,
      budgetChars: 24_000,
    })
    expect(rows.map((r) => r.kind)).toEqual([
      "spec",
      "spec",
      "run",
      "session",
      "context-standing",
      "context-standing",
      "context-pin",
      "lesson",
    ])
    expect(rows.map(rowKey).slice(4, 7)).toEqual(["context:rules", "context:lessons", "pin:0"])
    const verbs = (i: number) => rowActions(rows[i]!).map((o) => `${Option.getOrThrow(o.value)}:${o.label}`)
    expect(verbs(4)).toEqual(["toggle:switch off"])
    expect(verbs(5)).toEqual(["toggle:switch on"])
    expect(verbs(6)).toEqual(["toggle:switch off", "remove:remove"])
    expect(rowTitle(rows[6]!)).toBe("pin — src/x.ts 3.2k")
    expect(rowOption(rows[5]!, 5).tag).toBe("context")
  })
})
