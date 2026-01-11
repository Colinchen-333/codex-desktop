/**
 * AccountInfoSection - Account information display component
 *
 * Displays account login status and plan information.
 * Memoized to prevent unnecessary re-renders.
 */
import { memo, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { serverApi, type AccountInfo } from '../../../lib/api'
import { logError } from '../../../lib/errorUtils'

export const AccountInfoSection = memo(function AccountInfoSection() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchAccount = async () => {
      try {
        const info = await serverApi.getAccountInfo()
        if (isMounted) {
          setAccountInfo(info)
        }
      } catch (error) {
        logError(error, {
          context: 'AccountInfoSection',
          source: 'status-bar',
          details: 'Failed to fetch account info'
        })
      }
    }

    void fetchAccount()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="flex items-center gap-2 pr-3 border-r border-border/30">
      <ShieldCheck
        size={12}
        className={accountInfo?.account ? 'text-green-500' : 'text-yellow-500'}
      />
      {accountInfo?.account ? (
        <span className="truncate max-w-[120px]">
          {accountInfo.account.email || 'Logged in'}
          {accountInfo.account.planType && ` (${accountInfo.account.planType})`}
        </span>
      ) : (
        <span className="text-yellow-600/80 uppercase tracking-widest text-xs">
          Auth Required
        </span>
      )}
    </div>
  )
})
