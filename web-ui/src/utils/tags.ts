export function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  const backgroundColor = `hsl(${hue} 75% 65%)`
  const color = "#0f172a"
  return { backgroundColor, color }
}
