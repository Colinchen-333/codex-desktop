/**
 * Event Bus for Application-Wide Event Communication
 *
 * P1 Fix: Replaces dynamic imports with event-based communication
 * to prevent circular dependencies and improve performance.
 *
 * Usage:
 * - Import eventBus from this file
 * - Use eventBus.on() to subscribe to events
 * - Use eventBus.emit() to publish events
 * - Use eventBus.off() to unsubscribe
 */

import type { SessionStatus } from './api'

// ==================== Event Type Definitions ====================

export interface SessionStatusEvent {
  sessionId: string
  status: SessionStatus
}

export interface SessionClosedEvent {
  sessionId: string
}

export interface ThreadStatusChangeEvent {
  threadId: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
}

export interface SessionFirstMessageEvent {
  sessionId: string
  firstMessage: string
}

/**
 * Event map defining all available events and their payload types
 */
export interface EventMap {
  'session:status-update': SessionStatusEvent
  'session:closed': SessionClosedEvent
  'session:set-first-message': SessionFirstMessageEvent
  'thread:status-change': ThreadStatusChangeEvent
}

// ==================== Event Bus Implementation ====================

type EventHandler<T> = (data: T) => void

class EventBus {
  private listeners = new Map<keyof EventMap, Set<EventHandler<any>>>()

  /**
   * Subscribe to an event
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EventHandler<any>)

    // Return unsubscribe function
    return () => this.off(event, handler)
  }

  /**
   * Emit an event to all subscribers
   * @param event - Event name
   * @param data - Event payload
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return

    // Call all handlers, catching individual handler errors to prevent cascade
    handlers.forEach((handler) => {
      try {
        handler(data)
      } catch (error) {
        console.error(`[EventBus] Error in handler for event "${event}":`, error)
      }
    })
  }

  /**
   * Unsubscribe from an event
   * @param event - Event name
   * @param handler - Event handler function to remove
   */
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as EventHandler<any>)
      // Clean up empty listener sets
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  /**
   * Subscribe to an event for a single invocation
   * Handler is automatically unsubscribed after first invocation
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    const wrappedHandler = (data: EventMap[K]) => {
      this.off(event, wrappedHandler as EventHandler<EventMap[K]>)
      handler(data)
    }
    return this.on(event, wrappedHandler as EventHandler<EventMap[K]>)
  }

  /**
   * Clear all listeners for an event, or all listeners if no event specified
   * @param event - Optional event name to clear. If omitted, clears all events.
   */
  clear(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  /**
   * Get count of listeners for an event
   * @param event - Event name
   * @returns Number of subscribed handlers
   */
  listenerCount(event: keyof EventMap): number {
    return this.listeners.get(event)?.size ?? 0
  }

  /**
   * Get list of all event names that have listeners
   * @returns Array of event names
   */
  eventNames(): Array<keyof EventMap> {
    return Array.from(this.listeners.keys())
  }
}

// ==================== Singleton Instance ====================

/**
 * Global event bus instance
 * Use this to communicate between stores and components without circular dependencies
 */
export const eventBus = new EventBus()

// ==================== Development Helpers ====================

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Expose event bus for debugging in development
  ;(window as any).__eventBus = eventBus
}
