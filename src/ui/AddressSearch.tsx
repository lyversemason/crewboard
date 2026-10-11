// Address autocomplete for the sales intake. Uses Photon (photon.komoot.io),
// a free OpenStreetMap search with no account or API key, so there is nothing
// that can ever be billed. Results are limited to the territory's area, and
// the form falls back to typing the address by hand if the service is down.

import { useEffect, useRef, useState } from 'react'
import type { Territory } from '../engine'
import { SERVICE_MILES, addressLine, serviceAddresses } from './address'
import type { PhotonFeature, PickedAddress } from './address'

const MIN_CHARS = 5

export function AddressSearch({
  territory,
  value,
  onPick,
  onOffline,
  invalid,
}: {
  territory: Territory
  value: PickedAddress | null
  onPick: (a: PickedAddress | null) => void
  onOffline: () => void
  invalid?: boolean
}) {
  const [text, setText] = useState(value ? addressLine(value) : '')
  const [results, setResults] = useState<PickedAddress[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [status, setStatus] = useState<'' | 'searching' | 'none'>('')
  const lastQuery = useRef('')

  const q = text.trim()
  const searching = q.length >= MIN_CHARS && !(value && q === addressLine(value))

  useEffect(() => {
    if (!searching) return
    // Wait until typing pauses, so a fast typist sends one request, not ten.
    const timer = setTimeout(async () => {
      lastQuery.current = q
      setStatus('searching')
      const { lat, lng } = territory.center
      const bbox = [lng - 0.5, lat - 0.45, lng + 0.5, lat + 0.45].map((n) => n.toFixed(3)).join(',')
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${lat}&lon=${lng}&bbox=${bbox}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { features: PhotonFeature[] }
        if (lastQuery.current !== q) return
        const found = serviceAddresses(data.features, territory.center)
        setResults(found)
        setActive(0)
        setOpen(true)
        setStatus(found.length ? '' : 'none')
      } catch {
        setStatus('')
        onOffline()
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [q, searching, territory, onOffline])

  const pick = (a: PickedAddress) => {
    setText(addressLine(a))
    setOpen(false)
    setResults([])
    onPick(a)
  }

  return (
    <div className="address-search">
      <input
        value={text}
        placeholder={`Start typing the street address in ${territory.name}`}
        className={invalid ? 'invalid' : ''}
        aria-invalid={invalid || undefined}
        aria-autocomplete="list"
        aria-expanded={searching && open && results.length > 0}
        role="combobox"
        onChange={(e) => {
          setText(e.target.value)
          if (value) onPick(null)
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !results.length) return
          if (e.key === 'Escape') return setOpen(false)
          const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }
          if (e.key in moves) {
            e.preventDefault()
            setActive((active + moves[e.key] + results.length) % results.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(results[active])
          }
        }}
      />
      {searching && open && results.length > 0 && (
        <ul className="address-results" role="listbox">
          {results.map((a, i) => (
            <li key={addressLine(a)} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)} onMouseEnter={() => setActive(i)}>
                <strong>{a.street}</strong>
                <span>
                  {a.city}, {a.state} {a.zip}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && status === 'searching' && <p className="small muted">Searching…</p>}
      {searching && status === 'none' && <p className="small bad">No matching address within {SERVICE_MILES} miles of {territory.name}. Check the house number and street.</p>}
    </div>
  )
}
