import { Effect, Layer } from "effect"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { BlogReader, type BlogPost } from "../ports/blog-reader.port.js"
import { WORKSPACE_TREE } from "../domain/paths.js"

const BLOG_POSTS_DIR = join(WORKSPACE_TREE, "blog", "src", "content", "posts")

export const parseFrontmatter = (rawContent: string): {
  readonly title: string
  readonly description: string
  readonly tags: ReadonlyArray<string>
  /** `draft: true` — Astro does not publish it, so a reply must not link it. */
  readonly draft: boolean
  readonly body: string
} => {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return { title: "", description: "", tags: [], draft: false, body: rawContent }
  }
  
  const fmText = match[1] ?? ""
  const body = rawContent.slice(match[0]?.length ?? 0).trim()

  const folded = fmText.split("\n").reduce<{
    title: string
    description: string
    tags: ReadonlyArray<string>
    draft: boolean
  }>(
    (acc, line) => {
      const colonIndex = line.indexOf(":")
      if (colonIndex === -1) return acc
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      if (key === "draft") return { ...acc, draft: value.toLowerCase() === "true" }
      if (key === "title") return { ...acc, title: value.replace(/^['"]|['"]$/g, "") }
      if (key === "description") {
        return { ...acc, description: value.replace(/^['"]|['"]$/g, "") }
      }
      if (key === "tags" && value.startsWith("[") && value.endsWith("]")) {
        return {
          ...acc,
          tags: value
            .slice(1, -1)
            .split(",")
            .map((t) => t.trim().replace(/^['"]|['"]$/g, "")),
        }
      }
      return acc
    },
    { title: "", description: "", tags: [], draft: false },
  )

  return { ...folded, body }
}

export const AstroBlogReaderLive = Layer.succeed(
  BlogReader,
  BlogReader.of({
    getPosts: () =>
      Effect.tryPromise({
        try: async () => {
          const files = await readdir(BLOG_POSTS_DIR)
          const mdFiles = files.filter((f) => f.endsWith(".md") && f !== "typography-test.md")
          const posts: ReadonlyArray<BlogPost | undefined> = await Promise.all(
            mdFiles.map(async (file) => {
              const rawContent = await readFile(join(BLOG_POSTS_DIR, file), "utf-8")
              const { title, description, tags, draft, body } = parseFrontmatter(rawContent)
              // An unpublished post is not a link anyone can follow — the
              // slug oracle must not vouch for it (a dead link went out once).
              return draft
                ? undefined
                : {
                    slug: file.replace(/\.md$/, ""),
                    title,
                    description,
                    tags,
                    content: body,
                  }
            }),
          )
          return posts.flatMap((post) => (post === undefined ? [] : [post]))
        },
        catch: (e) => new Error(`Failed to read blog posts: ${String(e)}`),
      }),

    getPostContent: (slug: string) =>
      Effect.tryPromise({
        try: async () => {
          const filePath = join(BLOG_POSTS_DIR, `${slug}.md`)
          const rawContent = await readFile(filePath, "utf-8")
          const { body } = parseFrontmatter(rawContent)
          return body
        },
        catch: (e) => new Error(`Failed to read blog post "${slug}": ${String(e)}`),
      }),
  })
)
