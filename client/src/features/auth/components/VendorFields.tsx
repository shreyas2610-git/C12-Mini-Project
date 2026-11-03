import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, X, Check } from 'lucide-react'
import { useTrades } from '../hooks/useTrades'

interface VendorFieldsProps {
  companyName: string
  capacity: string
  selectedTradeIds: number[]
  onCompanyChange: (v: string) => void
  onCapacityChange: (v: string) => void
  onTradeToggle: (id: number) => void
}

export function VendorFields({
  companyName,
  capacity,
  selectedTradeIds,
  onCompanyChange,
  onCapacityChange,
  onTradeToggle,
}: VendorFieldsProps) {
  const { trades, loading, error } = useTrades()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedTrades = trades.filter((t) => selectedTradeIds.includes(t.trade_id))

  return (
    <div className="space-y-4">
      {/* Company Name */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Company Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => onCompanyChange(e.target.value)}
          placeholder="Acme Services Pvt. Ltd."
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      {/* Capacity */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Capacity <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={capacity}
          min={0}
          step={1}
          onChange={(e) => onCapacityChange(e.target.value)}
          placeholder="e.g. 10"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      {/* Multi-Select Trades Dropdown */}
      <div className="flex flex-col gap-1" ref={dropdownRef}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Trades <span className="text-red-500">*</span>
          </label>
          {selectedTrades.length > 0 && (
            <span className="text-xs font-medium text-indigo-600">
              {selectedTrades.length} selected
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600 ring-1 ring-red-200">
            Failed to load trades: {error}
          </div>
        )}

        {/* Selected Trades Tags/Pills */}
        {selectedTrades.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {selectedTrades.map((trade) => (
              <span
                key={trade.trade_id}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200"
              >
                {trade.name}
                <button
                  type="button"
                  onClick={() => onTradeToggle(trade.trade_id)}
                  className="rounded-full p-0.5 text-indigo-500 hover:bg-indigo-200/50 hover:text-indigo-800"
                  aria-label={`Remove ${trade.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Dropdown Toggle Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            disabled={loading || trades.length === 0}
            className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          >
            <span className="truncate">
              {loading
                ? 'Loading trades…'
                : trades.length === 0
                  ? 'No trades available'
                  : selectedTradeIds.length === 0
                    ? 'Select one or more trades…'
                    : `${selectedTradeIds.length} trade${selectedTradeIds.length > 1 ? 's' : ''} selected`}
            </span>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
              {trades.map((trade) => {
                const isSelected = selectedTradeIds.includes(trade.trade_id)
                return (
                  <button
                    key={trade.trade_id}
                    type="button"
                    onClick={() => onTradeToggle(trade.trade_id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-indigo-50 ${
                      isSelected ? 'bg-indigo-50/70 font-medium text-indigo-700' : 'text-gray-700'
                    }`}
                  >
                    <span>{trade.name}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
