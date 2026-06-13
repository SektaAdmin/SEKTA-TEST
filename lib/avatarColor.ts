const AVATAR_COLORS = [
  '#f5a623',
  '#7ed321',
  '#4a90e2',
  '#9b59b6',
  '#e74c3c',
  '#1abc9c',
]

export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
