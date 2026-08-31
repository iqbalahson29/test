import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ClipboardList, FileCheck2, Loader2, Search, Users } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { searchApi } from './api'
import type { SearchResultItem } from './types'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

const GROUPS: { key: keyof Awaited<ReturnType<typeof searchApi.search>>; label: string; icon: typeof Search }[] = [
  { key: 'workspaces', label: 'Workspaces', icon: Building2 },
  { key: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'attempts', label: 'Attempts & results', icon: FileCheck2 },
]

export function GlobalSearch({ dropdownPosition = 'bottom' }: { dropdownPosition?: 'top' | 'bottom' }) {
  const navigate = useNavigate()
  const { membership, switchWorkspace } = useAuth()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', query],
    queryFn: () => searchApi.search(query),
    enabled: query.length >= MIN_QUERY_LENGTH,
  })

  const groups = data
    ? GROUPS.map((g) => ({ ...g, items: data[g.key] as SearchResultItem[] })).filter(
        (g) => g.items.length > 0,
      )
    : []
  const showDropdown = open && query.length >= MIN_QUERY_LENGTH
  const isSwitching = switchingId !== null

  const onSelect = async (item: SearchResultItem) => {
    setOpen(false)
    setInput('')
    setQuery('')
    if (item.membershipId && item.membershipId !== membership?.membershipId) {
      setSwitchingId(item.id)
      try {
        await switchWorkspace(item.membershipId)
      } finally {
        setSwitchingId(null)
      }
    }
    navigate(item.path)
  }

  return (
    <div ref={containerRef} className="relative w-full md:w-[480px] lg:w-[660px]">
      <div className="flex w-full items-center gap-2 rounded-md border border-transparent bg-white px-3 py-1 text-[12px] text-gray-500 shadow-sm focus-within:border-primary-400">
        <Search size={13} className="shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search here..."
          className="flex-1 bg-transparent text-left text-[12px] text-gray-800 outline-none placeholder:text-gray-500"
        />
        <kbd className="shrink-0 rounded bg-gray-100 px-1 font-mono text-[10px]">&#8984;K</kbd>
      </div>

      {showDropdown && (
        <div
          className={`absolute right-0 left-0 z-40 max-h-[70vh] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg ${
            dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {isFetching || isSwitching ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[12.5px] text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              {isSwitching ? 'Opening…' : 'Searching…'}
            </div>
          ) : groups.length === 0 ? (
            <p className="px-3 py-4 text-[12.5px] text-gray-400">
              No results for &quot;{query}&quot;
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="py-1">
                <p className="px-3 py-1 text-[10.5px] font-semibold tracking-wide text-gray-400 uppercase">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <group.icon size={14} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-gray-800">
                        {item.title}
                      </span>
                      <span className="block truncate text-[11px] text-gray-400">
                        {item.subtitle}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
