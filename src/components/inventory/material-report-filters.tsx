"use client"

import { useMemo, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

type Item = { id: string; item_code: string; item_name: string; consumable_type: string | null }

/**
 * All filters live in the URL (searchParams), not client state — the report
 * page reads them server-side to build the summary/detail tables, so this
 * one set of filters drives the on-screen view, the printed view (just
 * window.print() on the same page) and the CSV export identically. No
 * separate "export filters" to keep in sync with "screen filters."
 */
export function MaterialReportFilters({
  from,
  to,
  typeFilter,
  locationFilter,
  itemFilter,
  locations,
  items,
}: {
  from: string
  to: string
  typeFilter: string
  locationFilter: string
  itemFilter: string
  locations: { id: string; code: string; name: string }[]
  items: Item[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [fromDate, setFromDate] = useState(from)
  const [toDate, setToDate] = useState(to)
  const [type, setType] = useState(typeFilter)
  const [location, setLocation] = useState(locationFilter)
  const [item, setItem] = useState(itemFilter)

  // Scoped to the currently chosen Material Type — picking "Powder" narrows
  // the Description list to just powder items, so a stale selection from a
  // different type can't silently linger after switching type.
  const scopedItems = useMemo(
    () => (type === "all" ? items : items.filter((i) => i.consumable_type === type)),
    [items, type]
  )

  function onTypeChange(value: string) {
    setType(value)
    if (item !== "all" && !items.some((i) => i.id === item && (value === "all" || i.consumable_type === value))) {
      setItem("all")
    }
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", fromDate)
    params.set("to", toDate)
    params.set("type", type)
    params.set("location", location)
    params.set("item", item)
    router.push(`${pathname}?${params.toString()}`)
  }

  function reset() {
    setFromDate(from)
    setToDate(to)
    setType("all")
    setLocation("all")
    setItem("all")
    router.push(pathname)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Material Type</Label>
        <Select value={type} onChange={(e) => onTypeChange(e.target.value)} className="mt-1">
          <option value="all">All types</option>
          <option value="wire">Wire</option>
          <option value="rod">Rod</option>
          <option value="powder">Powder</option>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Location</Label>
        <Select value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1">
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Select value={item} onChange={(e) => setItem(e.target.value)} className="mt-1">
          <option value="all">All materials</option>
          {scopedItems.map((i) => (
            <option key={i.id} value={i.id}>{i.item_code} — {i.item_name}</option>
          ))}
        </Select>
      </div>
      <Button size="sm" onClick={apply}>Apply</Button>
      <Button size="sm" variant="outline" onClick={reset}>Reset</Button>
    </div>
  )
}
