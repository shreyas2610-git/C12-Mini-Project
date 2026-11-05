import React from 'react'
import { Clock, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'

interface SlaBadgeProps {
  dueAt: string | null | undefined
  labelPrefix?: string
  isCompleted?: boolean
  className?: string
}

export function formatSlaTimeRemaining(dueAt: string | null | undefined) {
  if (!dueAt) return null
  const due = new Date(dueAt).getTime()
  const now = Date.now()
  const diffMs = due - now

  if (diffMs < 0) {
    const overdueMs = Math.abs(diffMs)
    const overdueMins = Math.floor(overdueMs / (1000 * 60))
    const overdueHours = Math.floor(overdueMins / 60)
    const remMins = overdueMins % 60

    let timeStr = ''
    if (overdueHours === 0) {
      timeStr = `${Math.max(1, overdueMins)}m`
    } else if (remMins === 0) {
      timeStr = `${overdueHours}h`
    } else {
      timeStr = `${overdueHours}h ${remMins}m`
    }

    return {
      isBreached: true,
      isDueSoon: false,
      text: `Overdue by ${timeStr} (SLA Breached)`,
      shortText: `Overdue +${timeStr}`,
      rawDiffMs: diffMs,
    }
  }

  const mins = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60

  let timeStr = ''
  if (hours === 0) {
    timeStr = `${Math.max(1, mins)}m`
  } else if (remMins === 0) {
    timeStr = `${hours}h`
  } else {
    timeStr = `${hours}h ${remMins}m`
  }

  const isDueSoon = mins <= 60

  return {
    isBreached: false,
    isDueSoon,
    text: `Due in ${timeStr}`,
    shortText: `${timeStr} left`,
    rawDiffMs: diffMs,
  }
}

export function SlaBadge({
  dueAt,
  labelPrefix = 'Response due in',
  isCompleted = false,
  className = '',
}: SlaBadgeProps) {
  if (!dueAt) return null

  if (isCompleted) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 ${className}`}
      >
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        SLA Met
      </span>
    )
  }

  const sla = formatSlaTimeRemaining(dueAt)
  if (!sla) return null

  if (sla.isBreached) {
    return (
      <span
        title={`SLA Deadline: ${new Date(dueAt).toLocaleString()}`}
        className={`inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200 animate-pulse ${className}`}
      >
        <AlertCircle className="h-3 w-3 text-red-600 shrink-0" />
        {sla.text}
      </span>
    )
  }

  if (sla.isDueSoon) {
    return (
      <span
        title={`SLA Deadline: ${new Date(dueAt).toLocaleString()}`}
        className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300 ${className}`}
      >
        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
        {labelPrefix ? `${labelPrefix}:` : 'Due:'} <strong>{sla.text.replace('Due in ', '')}</strong>
      </span>
    )
  }

  return (
    <span
      title={`SLA Deadline: ${new Date(dueAt).toLocaleString()}`}
      className={`inline-flex items-center gap-1 text-[11px] text-gray-600 ${className}`}
    >
      <Clock className="h-3 w-3 text-purple-600 shrink-0" />
      <span>{labelPrefix ? `${labelPrefix}:` : 'Due:'}</span>
      <strong className="text-gray-900">{sla.text.replace('Due in ', '')}</strong>
    </span>
  )
}

