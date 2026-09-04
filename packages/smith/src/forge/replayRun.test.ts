import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { FactoryRun } from "@xandreed/foundry"
import { initialFloor, reduceFloor } from "../tui/presentation/floor.js"
import { eventsFromRun } from "./replayRun.js"

const run = Schema.decodeUnknownSync(FactoryRun)({
  id: "22222222-2222-4222-8222-222222222222",
  spec: {
    goal: "Port the stats module to TypeScript with tests.",
    acceptance: ["bun test exits 0"],
    limits: { maxAttempts: 3, budgetMillis: 1000 },
  },
  attempts: [
    {
      attempt: 1,
      report: {
        verdicts: [
          { _tag: "pass", gate: "typecheck", durationMs: 1, findings: [] },
          {
            _tag: "fail",
            gate: "bun-test",
            durationMs: 1,
            findings: [{ rule: "command/bun-test", message: "1 test failed", severity: "error" }],
          },
        ],
      },
      feedback: "bun-test failed: 1 test failed",
      filesTouched: ["src/stats.ts"],
      durationMs: 5,
      implementorRef: "conversation:00000000-0000-4000-8000-000000000001",
    },
    {
      attempt: 2,
      report: {
        verdicts: [
          { _tag: "pass", gate: "typecheck", durationMs: 1, findings: [] },
          { _tag: "pass", gate: "bun-test", durationMs: 1, findings: [] },
        ],
      },
      filesTouched: ["src/stats.ts", "src/stats.test.ts"],
      durationMs: 5,
      implementorRef: "conversation:00000000-0000-4000-8000-000000000001",
    },
  ],
  outcome: { _tag: "accepted", attempt: 2 },
  startedAt: 0,
  endedAt: 10,
})

describe("replaying a persisted forge run", () => {
  test("the event trail is the live run's shape: start, per attempt (start · implemented · report), end", () => {
    const events = eventsFromRun(run, ".foundry/runs/2222.json")
    expect(events.map((e) => e.type)).toEqual([
      "forge_start",
      "attempt_start",
      "implement_end",
      "gate_report",
      "attempt_start",
      "implement_end",
      "gate_report",
      "forge_end",
    ])
    const start = events[0]
    expect(start?.type === "forge_start" && start.gateNames).toEqual(["typecheck", "bun-test"])
  })

  test("folded through the floor reducer it reads like the run just finished (replay ≡ live-fold)", () => {
    const floor = eventsFromRun(run, ".foundry/runs/2222.json").reduce(
      reduceFloor,
      initialFloor("", 3),
    )
    expect(floor.phase).toBe("done")
    expect(floor.task).toBe("Port the stats module to TypeScript with tests.")
    expect(floor.attempts).toHaveLength(2)
    expect(floor.attempts[0]?.gates.map((g) => g.state)).toEqual(["pass", "fail"])
    expect(floor.attempts[1]?.gates.map((g) => g.state)).toEqual(["pass", "pass"])
    expect(floor.attempts[1]?.files).toBe(2)
    expect(floor.outcome).toEqual(Option.some("accepted (attempt 2)"))
    expect(floor.artifact).toEqual(Option.some(".foundry/runs/2222.json"))
    expect(floor.conversationRef).toEqual(
      Option.some("conversation:00000000-0000-4000-8000-000000000001"),
    )
  })
})
