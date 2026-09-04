import * as ts from "typescript"
import { RuleId } from "../../domain/Brands.js"
import type { IdiomRule, RuleMatch } from "../idiomGate.js"
import { walk } from "../astWalk.js"

/** `as never` is `as any` with better manners: `never` is assignable to
 *  everything, so the cast turns the checker off at the call site exactly
 *  like `any` does — and it had become the codebase's sanctioned escape
 *  hatch. Where type erasure IS the design (a router wrapping arbitrary
 *  provider services, a bridge over dynamic tools), the profile names those
 *  files in `exclude`: a declared boundary, not a habit. */
export const noAsNever: IdiomRule = {
  id: RuleId.make("effect/no-as-never"),
  defaultSeverity: "error",
  description: "`as never` is banned outside the declared type-erasure boundary",
  fixHint: "fix the type, decode with Schema at the boundary, or name the file in the rule's `exclude` if erasure is the design there",
  check: ({ sourceFile }) => {
    const matches: Array<RuleMatch> = []
    walk(sourceFile, (node) => {
      if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.NeverKeyword) {
        matches.push({ node, message: "`as never` launders the type like `as any`" })
      }
    })
    return matches
  },
}
