import * as ts from "typescript"
import { RuleId } from "../../domain/Brands.js"
import type { IdiomRule, RuleMatch } from "../idiomGate.js"
import { walk } from "../astWalk.js"

const SKIP_PROPS = new Set(["skip", "todo"])
/** `.only` is the stronger gaming vector: it hides every OTHER test. */
const ONLY_PROP = "only"
const RUNNER_OBJECTS = new Set(["test", "it", "describe", "suite"])
const SKIP_IDENTIFIERS = new Set(["xit", "xdescribe", "xtest"])

/** A skipped test is the coder gaming the test gate: the suite stays green
 *  while the behavior goes unverified — and a focused (`.only`) test does it
 *  to the whole file at once. The judge hunts this as dishonesty — this
 *  catches it deterministically at rank 1, before judge tokens are spent.
 *  Pre-existing skips ride the baseline; NEW ones fail. */
export const noSkippedTests: IdiomRule = {
  id: RuleId.make("quality/no-skipped-tests"),
  defaultSeverity: "error",
  description: "skipped/todo/only tests are banned — a skipped test is invisible to the test gate, a focused one hides every other",
  fixHint: "make the test pass or delete it deliberately — never park it where the gate can't see it, never focus one and leave the rest dark",
  check: ({ sourceFile }) => {
    const matches: Array<RuleMatch> = []
    walk(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) return
      const callee = node.expression
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        RUNNER_OBJECTS.has(callee.expression.text) &&
        SKIP_PROPS.has(callee.name.text)
      ) {
        matches.push({
          node,
          message: `\`${callee.expression.text}.${callee.name.text}\` hides this test from the gate`,
        })
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        RUNNER_OBJECTS.has(callee.expression.text) &&
        callee.name.text === ONLY_PROP
      ) {
        matches.push({
          node,
          message: `\`${callee.expression.text}.only\` hides every OTHER test in this file from the gate`,
        })
      }
      if (ts.isIdentifier(callee) && SKIP_IDENTIFIERS.has(callee.text)) {
        matches.push({ node, message: `\`${callee.text}\` hides this test from the gate` })
      }
    })
    return matches
  },
}
