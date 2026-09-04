import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "./astro-blog-reader.adapter.js"

describe("the blog reader's frontmatter", () => {
  test("`draft: true` is read — an unpublished post is not a slug the gates may vouch for", () => {
    const published = parseFrontmatter('---\ntitle: "Retries"\ntags: [effect, retry]\n---\nbody')
    expect(published.draft).toBe(false)
    expect(published.title).toBe("Retries")
    expect(published.tags).toEqual(["effect", "retry"])
    const draft = parseFrontmatter("---\ntitle: WIP\ndraft: true\n---\nbody")
    expect(draft.draft).toBe(true)
    expect(parseFrontmatter("no frontmatter at all").draft).toBe(false)
  })
})
