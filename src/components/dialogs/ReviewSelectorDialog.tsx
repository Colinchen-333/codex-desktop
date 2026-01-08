import { useState, useEffect } from 'react'
import { projectApi, type GitBranch, type GitCommit, type ReviewTarget } from '../../lib/api'

interface ReviewSelectorDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (target: ReviewTarget) => void
  projectPath: string
}

type TabType = 'uncommitted' | 'branch' | 'commit' | 'custom'

export function ReviewSelectorDialog({
  isOpen,
  onClose,
  onSelect,
  projectPath,
}: ReviewSelectorDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('uncommitted')
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(false)
  const [customInstructions, setCustomInstructions] = useState('')
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && projectPath) {
      loadGitData()
    }
  }, [isOpen, projectPath])

  const loadGitData = async () => {
    setLoading(true)
    try {
      const [branchData, commitData] = await Promise.all([
        projectApi.getGitBranches(projectPath),
        projectApi.getGitCommits(projectPath, 20),
      ])
      setBranches(branchData)
      setCommits(commitData)
    } catch (error) {
      console.error('Failed to load git data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = () => {
    let target: ReviewTarget

    switch (activeTab) {
      case 'uncommitted':
        target = { type: 'uncommittedChanges' }
        break
      case 'branch':
        if (!selectedBranch) return
        target = { type: 'baseBranch', branch: selectedBranch }
        break
      case 'commit': {
        if (!selectedCommit) return
        const commit = commits.find((c) => c.sha === selectedCommit)
        target = { type: 'commit', sha: selectedCommit, title: commit?.title }
        break
      }
      case 'custom':
        if (!customInstructions.trim()) return
        target = { type: 'custom', instructions: customInstructions.trim() }
        break
      default:
        return
    }

    onSelect(target)
    onClose()
  }

  const canSubmit = () => {
    switch (activeTab) {
      case 'uncommitted':
        return true
      case 'branch':
        return !!selectedBranch
      case 'commit':
        return !!selectedCommit
      case 'custom':
        return customInstructions.trim().length > 0
      default:
        return false
    }
  }

  if (!isOpen) return null

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'uncommitted', label: 'Uncommitted', icon: '📝' },
    { id: 'branch', label: 'Branch', icon: '🌿' },
    { id: 'commit', label: 'Commit', icon: '📌' },
    { id: 'custom', label: 'Custom', icon: '✏️' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Review Target</h2>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="h-[300px] overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : (
            <>
              {activeTab === 'uncommitted' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Review all uncommitted changes in your working directory.
                  </p>
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📝</span>
                      <div>
                        <div className="font-medium">Uncommitted Changes</div>
                        <div className="text-sm text-muted-foreground">
                          Staged and unstaged changes
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'branch' && (
                <div className="space-y-2">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Compare current HEAD against a base branch.
                  </p>
                  {branches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No branches found.</p>
                  ) : (
                    branches.map((branch) => (
                      <button
                        key={branch.name}
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selectedBranch === branch.name
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                        }`}
                        onClick={() => setSelectedBranch(branch.name)}
                      >
                        <span className="text-lg">🌿</span>
                        <div className="flex-1">
                          <div className="font-medium">{branch.name}</div>
                          {branch.isCurrent && (
                            <span className="text-xs text-muted-foreground">(current)</span>
                          )}
                        </div>
                        {selectedBranch === branch.name && (
                          <span className="text-primary">✓</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'commit' && (
                <div className="space-y-2">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Review a specific commit.
                  </p>
                  {commits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No commits found.</p>
                  ) : (
                    commits.map((commit) => (
                      <button
                        key={commit.sha}
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selectedCommit === commit.sha
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                        }`}
                        onClick={() => setSelectedCommit(commit.sha)}
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {commit.shortSha}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{commit.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {commit.author} • {commit.date}
                          </div>
                        </div>
                        {selectedCommit === commit.sha && (
                          <span className="text-primary">✓</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'custom' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Provide custom review instructions.
                  </p>
                  <textarea
                    className="h-[200px] w-full resize-none rounded-lg border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none"
                    placeholder="Enter custom review instructions..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleSelect}
            disabled={!canSubmit()}
          >
            Start Review
          </button>
        </div>
      </div>
    </div>
  )
}
