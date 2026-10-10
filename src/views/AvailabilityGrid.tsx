// Monday-Saturday x 9am-6pm in one-hour blocks, as the spec describes.

import type { Weekday } from '../engine'

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6]
const DAY_SHORT = ['', 'M', 'T', 'W', 'T', 'F', 'S']
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17]
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? 'p' : 'a'}`

export function AvailabilityGrid({
  value,
  onChange,
  mini,
}: {
  value: Record<Weekday, number[]>
  onChange?: (v: Record<Weekday, number[]>) => void
  mini?: boolean
}) {
  const toggle = (d: Weekday, h: number) => {
    if (!onChange) return
    const has = value[d].includes(h)
    onChange({ ...value, [d]: has ? value[d].filter((x) => x !== h) : [...value[d], h].sort((a, b) => a - b) })
  }
  const toggleDay = (d: Weekday) => onChange?.({ ...value, [d]: value[d].length === HOURS.length ? [] : [...HOURS] })

  if (mini) {
    return (
      <span className="avail mini" aria-label="Availability summary">
        {DAYS.map((d) => (
          <span key={d} className="avail-col">
            {HOURS.map((h) => (
              <i key={h} className={value[d].includes(h) ? 'on' : ''} />
            ))}
          </span>
        ))}
      </span>
    )
  }

  return (
    <table className="avail full">
      <thead>
        <tr>
          <th />
          {DAYS.map((d) => (
            <th key={d}>
              <button type="button" className="linklike" onClick={() => toggleDay(d)} disabled={!onChange}>
                {['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {HOURS.map((h) => (
          <tr key={h}>
            <th>{hourLabel(h)}</th>
            {DAYS.map((d) => (
              <td key={d}>
                <button
                  type="button"
                  className={`slot ${value[d].includes(h) ? 'on' : ''}`}
                  onClick={() => toggle(d, h)}
                  disabled={!onChange}
                  aria-pressed={value[d].includes(h)}
                  aria-label={`${DAY_SHORT[d]} ${hourLabel(h)}`}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
