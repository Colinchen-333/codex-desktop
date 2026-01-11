import { memo, useState, useEffect, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { allowlistApi } from '../../../lib/api'
import { useProjectsStore } from '../../../stores/projects'

/**
 * Empty state when no commands in allowlist
 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
      No commands in allowlist. Add commands above.
    </div>
  )
})

/**
 * Command list item component
 */
const CommandItem = memo(function CommandItem({
  command,
  onRemove,
}: {
  command: string
  onRemove: (cmd: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <code className="text-sm font-mono truncate flex-1">{command}</code>
      <button
        onClick={() => onRemove(command)}
        className="text-muted-foreground hover:text-destructive transition-colors p-1"
        title="Remove from allowlist"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
})

/**
 * Add command form component
 */
const AddCommandForm = memo(function AddCommandForm({
  value,
  onChange,
  onAdd,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onAdd: () => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-2 mb-4">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        placeholder="e.g., npm install, git status"
        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        onClick={onAdd}
        disabled={disabled}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
      >
        <Plus size={16} />
        Add
      </button>
    </div>
  )
})

/**
 * Tips section component
 */
const AllowlistTips = memo(function AllowlistTips() {
  return (
    <div className="text-xs text-muted-foreground">
      <strong>Tips:</strong>
      <ul className="list-disc list-inside mt-1 space-y-0.5">
        <li>
          Use <code className="bg-secondary px-1 rounded">*</code> as a wildcard
          (e.g., <code className="bg-secondary px-1 rounded">npm *</code>)
        </li>
        <li>Each project has its own allowlist</li>
        <li>Commands are matched exactly or by pattern</li>
      </ul>
    </div>
  )
})

/**
 * Allowlist settings tab component
 * Handles command allowlist management per project
 */
export const AllowlistTab = memo(function AllowlistTab() {
  const { selectedProjectId, projects } = useProjectsStore()
  const [commands, setCommands] = useState<string[]>([])
  const [newCommand, setNewCommand] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Fetch allowlist when project changes
  const fetchAllowlist = useCallback(async () => {
    if (!selectedProjectId) return
    setIsLoading(true)
    setError(null)
    try {
      const list = await allowlistApi.get(selectedProjectId)
      setCommands(list)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    void fetchAllowlist()
  }, [fetchAllowlist])

  const handleAdd = useCallback(async () => {
    if (!selectedProjectId || !newCommand.trim()) return
    try {
      await allowlistApi.add(selectedProjectId, newCommand.trim())
      setNewCommand('')
      await fetchAllowlist()
    } catch (err) {
      setError(String(err))
    }
  }, [selectedProjectId, newCommand, fetchAllowlist])

  const handleRemove = useCallback(
    async (command: string) => {
      if (!selectedProjectId) return
      try {
        await allowlistApi.remove(selectedProjectId, command)
        await fetchAllowlist()
      } catch (err) {
        setError(String(err))
      }
    },
    [selectedProjectId, fetchAllowlist]
  )

  // No project selected state
  if (!selectedProjectId) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium">Command Allowlist</h3>
        <div className="text-muted-foreground text-sm">
          Please select a project first to manage its command allowlist.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Command Allowlist</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Project:{' '}
          <span className="font-medium text-foreground">
            {selectedProject?.displayName || selectedProject?.path}
          </span>
        </p>
      </div>

      {/* Main content */}
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Commands in the allowlist will be automatically approved without
          prompting. Use patterns like{' '}
          <code className="bg-secondary px-1 rounded">npm *</code> or exact
          commands.
        </p>

        {/* Add new command */}
        <AddCommandForm
          value={newCommand}
          onChange={setNewCommand}
          onAdd={handleAdd}
          disabled={!newCommand.trim()}
        />

        {/* Error display */}
        {error && <div className="text-sm text-destructive mb-4">{error}</div>}

        {/* Command list */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : commands.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {commands.map((cmd) => (
              <CommandItem key={cmd} command={cmd} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <AllowlistTips />
    </div>
  )
})
