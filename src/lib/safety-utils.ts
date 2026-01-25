export type RiskLevel = 'high' | 'medium' | 'low'

const LOW_RISK_PATTERNS = [/\.md$/, /\.txt$/, /test.*\.tsx?$/, /\.test\./, /\.spec\./]
const HIGH_RISK_PATTERNS = [/package\.json$/, /\.env/, /config/, /src\/stores/, /src\/lib/]

export function classifyRisk(change: { path: string; kind: string; diff?: string }): RiskLevel {
  const isLowRisk = LOW_RISK_PATTERNS.some(p => p.test(change.path))
  const isHighRisk = HIGH_RISK_PATTERNS.some(p => p.test(change.path))
  
  if (isHighRisk) return 'high'
  if (isLowRisk) return 'low'
  return 'medium'
}

export function getRiskBadgeStyles(risk: RiskLevel): string {
  switch (risk) {
    case 'high':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    case 'medium':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    case 'low':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  }
}
