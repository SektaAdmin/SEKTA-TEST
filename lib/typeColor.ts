const TYPE_COLORS = [
  '#5b8af5',
  '#c8f060',
  '#f07850',
  '#a06cf0',
  '#50c8d8',
  '#f0c840',
  '#e05080',
  '#60d890',
]

export function typeColor(code: string): string {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return TYPE_COLORS[h % TYPE_COLORS.length]
}
