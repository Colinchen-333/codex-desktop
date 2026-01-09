import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Timestamp unit detection threshold constant.
 *
 * This value (10000000000) represents the boundary between Unix timestamps in seconds
 * and milliseconds. It corresponds to approximately September 2001 in milliseconds,
 * or year 2286 in seconds. Since all modern timestamps are well past 2001, any value
 * below this threshold is assumed to be in seconds and needs conversion to milliseconds.
 *
 * Note: The backend API (Tauri/SQLite) returns timestamps in seconds (Unix timestamp),
 * while JavaScript Date APIs expect milliseconds. This constant helps detect and convert
 * between the two formats.
 *
 * @see formatAbsoluteTime
 * @see formatSessionTime
 */
const TIMESTAMP_SECONDS_THRESHOLD = 10000000000

/**
 * Normalize timestamp to milliseconds.
 * Detects if the timestamp is in seconds or milliseconds and converts to milliseconds.
 *
 * @param timestamp - Unix timestamp in either seconds or milliseconds
 * @returns Timestamp in milliseconds
 */
export function normalizeTimestampToMs(timestamp: number): number {
  // Values below threshold are assumed to be in seconds (Unix timestamp)
  // Values above threshold are assumed to be in milliseconds
  return timestamp < TIMESTAMP_SECONDS_THRESHOLD ? timestamp * 1000 : timestamp
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
 *
 * @param timestamp - Unix timestamp in either seconds or milliseconds
 *                    (Backend API returns seconds, JS Date expects milliseconds)
 */
export function formatAbsoluteTime(timestamp: number): string {
  // Handle invalid timestamps (explicitly check for null/undefined/negative, allow 0)
  if (timestamp == null || timestamp < 0) {
    return ''
  }

  // Normalize timestamp to milliseconds using the threshold-based detection
  const ts = normalizeTimestampToMs(timestamp)
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
 *
 * @param timestamp - Unix timestamp in either seconds or milliseconds
 *                    (Backend API returns seconds, JS Date expects milliseconds)
 */
export function formatSessionTime(timestamp: number): string {
  // Handle invalid timestamps (explicitly check for null/undefined/negative, allow 0)
  if (timestamp == null || timestamp < 0) {
    return ''
  }

  // Normalize timestamp to milliseconds using the threshold-based detection
  const ts = normalizeTimestampToMs(timestamp)
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
