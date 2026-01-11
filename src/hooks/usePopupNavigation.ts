/**
 * usePopupNavigation Hook
 *
 * 提取自 SlashCommandPopup 和 FileMentionPopup 的通用键盘导航逻辑
 * 用于处理弹窗列表的键盘交互：
 * - ArrowUp/Down: 切换选中项
 * - Enter/Tab: 确认选择
 * - Escape: 关闭弹窗
 *
 * @example
 * const { selectedIndex, setSelectedIndex } = usePopupNavigation({
 *   items: filteredCommands,
 *   onSelect: handleSelect,
 *   onClose: handleClose,
 *   isVisible: showPopup,
 * })
 */

import { useEffect, useState, useCallback } from 'react'

/**
 * 弹窗导航配置选项
 */
export interface UsePopupNavigationOptions<T> {
  /** 可选项列表 */
  items: T[]
  /** 选中某项时的回调 */
  onSelect: (item: T) => void
  /** 关闭弹窗的回调 */
  onClose: () => void
  /** 弹窗是否可见 */
  isVisible: boolean
  /** 是否循环滚动（默认 false，到达边界时停止） */
  loop?: boolean
}

/**
 * 弹窗导航 Hook 返回值
 */
export interface UsePopupNavigationReturn {
  /** 当前选中项的索引 */
  selectedIndex: number
  /** 手动设置选中索引（用于鼠标悬停等场景） */
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}

/**
 * 弹窗键盘导航 Hook
 *
 * 提供统一的弹窗列表键盘导航功能，支持：
 * - 上下箭头键切换选中项
 * - Enter/Tab 确认选择
 * - Escape 关闭弹窗
 * - 自动重置选中状态
 *
 * @param options - 导航配置选项
 * @returns 选中索引状态和设置函数
 */
export function usePopupNavigation<T>({
  items,
  onSelect,
  onClose,
  isVisible,
  loop = false,
}: UsePopupNavigationOptions<T>): UsePopupNavigationReturn {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 当弹窗显示或列表项变化时，重置选中索引
  // 确保用户始终从第一项开始浏览
  useEffect(() => {
    if (isVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset index when popup becomes visible
      setSelectedIndex(0)
    }
  }, [isVisible, items])

  // 处理向下导航
  const handleArrowDown = useCallback(() => {
    setSelectedIndex((prev) => {
      if (items.length === 0) return 0
      if (loop) {
        // 循环模式：到达末尾后回到开头
        return (prev + 1) % items.length
      }
      // 非循环模式：到达末尾时停止
      return Math.min(prev + 1, items.length - 1)
    })
  }, [items.length, loop])

  // 处理向上导航
  const handleArrowUp = useCallback(() => {
    setSelectedIndex((prev) => {
      if (items.length === 0) return 0
      if (loop) {
        // 循环模式：到达开头后回到末尾
        return (prev - 1 + items.length) % items.length
      }
      // 非循环模式：到达开头时停止
      return Math.max(prev - 1, 0)
    })
  }, [items.length, loop])

  // 处理选择确认
  const handleSelect = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      onSelect(items[selectedIndex])
    }
  }, [items, selectedIndex, onSelect])

  // 键盘事件监听
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          handleArrowDown()
          break
        case 'ArrowUp':
          e.preventDefault()
          handleArrowUp()
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          handleSelect()
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, handleArrowDown, handleArrowUp, handleSelect, onClose])

  return { selectedIndex, setSelectedIndex }
}
