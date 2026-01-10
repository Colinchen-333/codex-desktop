import type { SessionStatus } from '../../lib/types/thread'

const statusConfig = {
  idle: { label: 'Idle', labelCn: '空闲' },
  running: { label: 'Running', labelCn: '运行中' },
  completed: { label: 'Completed', labelCn: '已完成' },
  failed: { label: 'Failed', labelCn: '失败' },
  interrupted: { label: 'Interrupted', labelCn: '已中断' },
}

// Get status label in Chinese
export function getStatusLabel(status: SessionStatus, useChinese = true): string {
  const config = statusConfig[status] || statusConfig.idle
  return useChinese ? config.labelCn : config.label
}