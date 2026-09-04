import { Option } from "effect"
import type { FactoryRun } from "@xandreed/foundry"
import type { SmithEvent } from "../domain/SmithEvent.js"

/**
 * A persisted forge run, REPLAYED as the events the live run published — the
 * floor and the story fold it through the same reducers (replay ≡ live-fold),
 * so opening an artifact from the dashboard reads exactly like having watched
 * the run. Pure; the artifact path is what the pane prints.
 */
export const eventsFromRun = (run: FactoryRun, artifact: string): ReadonlyArray<SmithEvent> => {
  // Gate names in first-seen order across attempts — the floor's columns.
  const gateNames = [
    ...new Set(run.attempts.flatMap((a) => a.report.verdicts.map((v) => String(v.gate)))),
  ]
  return [
    { type: "forge_start", spec: run.spec, gateNames, doc: Option.none() },
    ...run.attempts.flatMap(
      (attempt): ReadonlyArray<SmithEvent> => [
        { type: "attempt_start", attempt: attempt.attempt },
        {
          type: "implement_end",
          attempt: attempt.attempt,
          filesTouched: attempt.filesTouched.map(String),
          ref: attempt.implementorRef,
        },
        {
          type: "gate_report",
          attempt: attempt.attempt,
          report: attempt.report,
          feedback: attempt.feedback,
        },
      ],
    ),
    { type: "forge_end", run, artifact },
  ]
}
