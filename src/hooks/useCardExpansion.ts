/**
 * useCardExpansion Hook
 *
 * 管理卡片展开/折叠状态，支持多个卡片独立控制。
 * 常用于折叠面板、FAQ、设置页面等场景。
 *
 * @example
 * function CardList({ cards }) {
 *   const {
 *     isExpanded,
 *     toggle,
 *     expandAll,
 *     collapseAll,
 *     expandedCount,
 *   } = useCardExpansion({
 *     defaultExpanded: ['card-1'], // 默认展开第一个
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={expandAll}>展开全部</button>
 *       <button onClick={collapseAll}>折叠全部</button>
 *       {cards.map((card) => (
 *         <Card
 *           key={card.id}
 *           isExpanded={isExpanded(card.id)}
 *           onToggle={() => toggle(card.id)}
 *         />
 *       ))}
 *     </div>
 *   )
 * }
 */

import { useState, useCallback } from 'react'

/**
 * 卡片展开状态配置选项
 */
export interface UseCardExpansionOptions {
  /** 默认展开的卡片 ID 列表 */
  defaultExpanded?: string[]
  /** 是否允许同时展开多个（默认 true） */
  allowMultiple?: boolean
  /** 展开状态变化回调 */
  onChange?: (expandedIds: string[]) => void
}

/**
 * 卡片展开状态 Hook 返回值
 */
export interface UseCardExpansionReturn {
  /** 检查指定卡片是否展开 */
  isExpanded: (id: string) => boolean
  /** 切换指定卡片的展开状态 */
  toggle: (id: string) => void
  /** 展开指定卡片 */
  expand: (id: string) => void
  /** 折叠指定卡片 */
  collapse: (id: string) => void
  /** 展开全部卡片 */
  expandAll: (ids: string[]) => void
  /** 折叠全部卡片 */
  collapseAll: () => void
  /** 获取当前展开的卡片 ID 列表 */
  expandedIds: string[]
  /** 获取当前展开的卡片数量 */
  expandedCount: number
  /** 设置展开的卡片 ID 列表 */
  setExpandedIds: (ids: string[]) => void
}

/**
 * 卡片展开状态管理 Hook
 *
 * 提供以下功能：
 * - 管理多个卡片的独立展开/折叠状态
 * - 支持单选/多选模式
 * - 支持默认展开设置
 * - 支持展开全部/折叠全部
 * - 状态变化回调
 *
 * @param options - 配置选项
 * @returns 卡片展开状态控制接口
 */
export function useCardExpansion(
  options: UseCardExpansionOptions = {}
): UseCardExpansionReturn {
  const { defaultExpanded = [], allowMultiple = true, onChange } = options

  const [expandedIds, setExpandedIdsState] = useState<string[]>(defaultExpanded)

  /**
   * 更新展开状态并触发回调
   */
  const updateExpandedIds = useCallback(
    (newIds: string[]) => {
      setExpandedIdsState(newIds)
      onChange?.(newIds)
    },
    [onChange]
  )

  /**
   * 检查指定卡片是否展开
   */
  const isExpanded = useCallback(
    (id: string): boolean => {
      return expandedIds.includes(id)
    },
    [expandedIds]
  )

  /**
   * 切换指定卡片的展开状态
   */
  const toggle = useCallback(
    (id: string) => {
      if (expandedIds.includes(id)) {
        // 已展开，折叠它
        updateExpandedIds(expandedIds.filter((expandedId) => expandedId !== id))
      } else {
        // 未展开，展开它
        if (allowMultiple) {
          updateExpandedIds([...expandedIds, id])
        } else {
          // 单选模式：只保留当前卡片
          updateExpandedIds([id])
        }
      }
    },
    [expandedIds, allowMultiple, updateExpandedIds]
  )

  /**
   * 展开指定卡片
   */
  const expand = useCallback(
    (id: string) => {
      if (expandedIds.includes(id)) return

      if (allowMultiple) {
        updateExpandedIds([...expandedIds, id])
      } else {
        updateExpandedIds([id])
      }
    },
    [expandedIds, allowMultiple, updateExpandedIds]
  )

  /**
   * 折叠指定卡片
   */
  const collapse = useCallback(
    (id: string) => {
      if (!expandedIds.includes(id)) return
      updateExpandedIds(expandedIds.filter((expandedId) => expandedId !== id))
    },
    [expandedIds, updateExpandedIds]
  )

  /**
   * 展开全部卡片
   */
  const expandAll = useCallback(
    (ids: string[]) => {
      if (!allowMultiple && ids.length > 0) {
        // 单选模式：只展开第一个
        updateExpandedIds([ids[0]])
      } else {
        // 合并现有展开的和新的 ID
        const newIds = [...new Set([...expandedIds, ...ids])]
        updateExpandedIds(newIds)
      }
    },
    [expandedIds, allowMultiple, updateExpandedIds]
  )

  /**
   * 折叠全部卡片
   */
  const collapseAll = useCallback(() => {
    updateExpandedIds([])
  }, [updateExpandedIds])

  /**
   * 直接设置展开的卡片 ID 列表
   */
  const setExpandedIds = useCallback(
    (ids: string[]) => {
      if (!allowMultiple && ids.length > 1) {
        // 单选模式：只保留第一个
        updateExpandedIds([ids[0]])
      } else {
        updateExpandedIds(ids)
      }
    },
    [allowMultiple, updateExpandedIds]
  )

  /**
   * 展开的卡片数量
   */
  const expandedCount = expandedIds.length

  return {
    isExpanded,
    toggle,
    expand,
    collapse,
    expandAll,
    collapseAll,
    expandedIds,
    expandedCount,
    setExpandedIds,
  }
}

/**
 * 单个卡片的展开状态 Hook
 * 适用于只需要管理单个卡片状态的场景
 *
 * @example
 * function Card() {
 *   const { isExpanded, toggle, expand, collapse } = useSingleCardExpansion(false)
 *
 *   return (
 *     <div>
 *       <button onClick={toggle}>
 *         {isExpanded ? 'Collapse' : 'Expand'}
 *       </button>
 *       {isExpanded && <div>Card content</div>}
 *     </div>
 *   )
 * }
 */
export function useSingleCardExpansion(
  defaultExpanded = false,
  onChange?: (isExpanded: boolean) => void
): {
  isExpanded: boolean
  toggle: () => void
  expand: () => void
  collapse: () => void
  setExpanded: (value: boolean) => void
} {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const updateExpanded = useCallback(
    (value: boolean) => {
      setIsExpanded(value)
      onChange?.(value)
    },
    [onChange]
  )

  const toggle = useCallback(() => {
    updateExpanded(!isExpanded)
  }, [isExpanded, updateExpanded])

  const expand = useCallback(() => {
    updateExpanded(true)
  }, [updateExpanded])

  const collapse = useCallback(() => {
    updateExpanded(false)
  }, [updateExpanded])

  const setExpanded = useCallback(
    (value: boolean) => {
      updateExpanded(value)
    },
    [updateExpanded]
  )

  return {
    isExpanded,
    toggle,
    expand,
    collapse,
    setExpanded,
  }
}
