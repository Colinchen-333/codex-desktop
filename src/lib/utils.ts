import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000 // Convert from Unix timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return new Date(timestamp * 1000).toLocaleDateString()
  } else if (days > 1) {
    return `${days} 天前`
  } else if (days === 1) {
    return '昨天'
  } else if (hours > 1) {
    return `${hours} 小时前`
  } else if (hours === 1) {
    return '1 小时前'
  } else if (minutes > 1) {
    return `${minutes} 分钟前`
  } else if (minutes === 1) {
    return '1 分钟前'
  } else {
    return '刚刚'
  }
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}
