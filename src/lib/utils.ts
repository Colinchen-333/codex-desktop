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

/**
 * Format timestamp to absolute time in Chinese format
 * e.g., "1月6日 14:31"
 */
export function formatAbsoluteTime(timestamp: number): string {
  // Handle invalid timestamps
  if (!timestamp || timestamp <= 0) {
    return ''
  }

  // Convert Unix timestamp (seconds) to milliseconds if needed
  const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp
  const date = new Date(ts)

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return ''
  }

  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')

  // Check if it's the current year
  const now = new Date()
  const isCurrentYear = date.getFullYear() === now.getFullYear()

  if (isCurrentYear) {
    return `${month}月${day}日 ${hours}:${minutes}`
  } else {
    const year = date.getFullYear()
    return `${year}年${month}月${day}日 ${hours}:${minutes}`
  }
}

/**
 * Format timestamp for display in session list
 * Shows relative time for recent, absolute time for older
 */
export function formatSessionTime(timestamp: number): string {
  // Handle invalid timestamps
  if (!timestamp || timestamp <= 0) {
    return ''
  }

  // Convert Unix timestamp (seconds) to milliseconds if needed
  const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp
  const now = Date.now()
  const diff = now - ts

  // Less than 24 hours ago - show relative time
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    const minutes = Math.floor(diff / (60 * 1000))

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours === 1) return '1 小时前'
    return `${hours} 小时前`
  }

  // More than 24 hours ago - show absolute time
  return formatAbsoluteTime(timestamp)
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}
