declare const test: {
  skip: (name: string, fn: () => void) => void
  todo: (name: string) => void
  only: (name: string, fn: () => void) => void
}
declare const xit: (name: string, fn: () => void) => void
test.skip("parked", () => {})
test.todo("later")
xit("also parked", () => {})
test.only("focused — every other test goes dark", () => {})
