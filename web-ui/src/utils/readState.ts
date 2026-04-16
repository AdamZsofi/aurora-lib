export type ReadStateOption = {
  value: string
  label: string
  emoji: string
}

export const READ_STATE_OPTIONS: ReadStateOption[] = [
  { value: "unread", label: "Unread", emoji: "⚪" },
  { value: "want_to_read", label: "Want to read", emoji: "⭐" },
  { value: "reading", label: "Reading", emoji: "📖" },
  { value: "read_abstract", label: "Read: abstract", emoji: "📄" },
  { value: "read_shallow", label: "Read: shallow", emoji: "📘" },
  { value: "read_deep", label: "Read: deep", emoji: "📚" },
]

export function readStateEmoji(state?: string | null): string {
  const match = READ_STATE_OPTIONS.find((o) => o.value === (state || "unread"))
  return match ? match.emoji : "⚪"
}

export function readStateLabel(state?: string | null): string {
  const match = READ_STATE_OPTIONS.find((o) => o.value === (state || "unread"))
  return match ? match.label : "Unread"
}
