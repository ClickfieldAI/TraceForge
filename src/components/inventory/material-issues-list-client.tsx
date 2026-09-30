"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, ChevronRight, Download, Search, ArrowRightLeft } from "lucide-react"
import { buttonVariants, Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatQty } from "@/lib/format"

type IssueItem = {
  issued_qty: number
  consumed_qty: number | null
  returned_qty: number
  uom: string
  remarks: string | null
  item_master: { id: string; item_code: string; item_name: string; consumable_type: string | null } | null
  storage_locations: { id: string; code: string } | null
}

export type IssueRow = {
  id: string
  issue_number: string
  issue_date: string
  status: string
  consumption_status: string
  issued_to: string | null
  destination: string | null
  remarks: string | null
  job_cards: { jc_number: string } | null
  material_issue_items: IssueItem[]
}

type TypeFilter = "all" | "wire" | "rod" | "powder"
type Location = { id: string; code: string; name: string }
type Item = { id: string; item_code: string; item_name: string; consumable_type: string | null }

/** "E7018 Electrode" or "E7018 Electrode +2 more" — the materials on an issue. */
function materialSummary(items: IssueItem[]): string {
  const names = items.map((i) => i.item_master?.item_name).filter(Boolean) as string[]
  if (names.length === 0) return "—"
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1} more`
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Same criteria the on-screen list uses to decide whether a line "counts" for the active filters. */
function matchesLine(it: IssueItem, typeFilter: TypeFilter, locationFilter: string, itemFilter: string): boolean {
  if (typeFilter !== "all" && it.item_master?.consumable_type !== typeFilter) return false
  if (locationFilter !== "all" && it.storage_locations?.id !== locationFilter) return false
  if (itemFilter !== "all" && it.item_master?.id !== itemFilter) return false
  return true
}

/**
 * Exports one CSV row per matching item LINE, not per issue. With filters
 * active, an issue that mixes (say) wire and rod lines must export only its
 * matching lines — otherwise "export while filtered to Wire" would still
 * drag in that issue's unrelated rod lines, which is the exact bug this
 * fixed originally; the same logic now also applies to Location/Description.
 */
function exportCsv(records: IssueRow[], typeFilter: TypeFilter, locationFilter: string, itemFilter: string) {
  const header = [
    "Issue No", "Date", "Job Card", "Issued To", "Destination", "Status", "Usage", "Issue Remarks",
    "Item Code", "Item Name", "Type", "Location", "Issued Qty", "Consumed Qty", "Returned Qty", "UOM", "Item Remarks",
  ]
  const rows: string[] = [header.join(",")]
  const noFiltersActive = typeFilter === "all" && locationFilter === "all" && itemFilter === "all"
  for (const r of records) {
    const date = new Date(r.issue_date).toLocaleDateString("en-IN")
    const base = [r.issue_number, date, r.job_cards?.jc_number ?? "", r.issued_to ?? "", r.destination ?? "", r.status, r.consumption_status, r.remarks ?? ""]
    const lines = r.material_issue_items.filter((it) => matchesLine(it, typeFilter, locationFilter, itemFilter))

    if (lines.length === 0) {
      if (noFiltersActive) rows.push([...base, "", "", "", "", "", "", "", ""].map(csvEscape).join(","))
      continue
    }
    for (const it of lines) {
      rows.push([
        ...base,
        it.item_master?.item_code ?? "", it.item_master?.item_name ?? "", it.item_master?.consumable_type ?? "",
        it.storage_locations?.code ?? "",
        it.issued_qty, it.consumed_qty ?? "", it.returned_qty, it.uom, it.remarks ?? "",
      ].map(csvEscape).join(","))
    }
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  const suffix = typeFilter === "all" ? "" : `-${typeFilter}`
  a.download = `material-issues${suffix}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function MaterialIssuesListClient({
  records,
  canCreate,
  locations,
  items,
}: {
  records: IssueRow[]
  canCreate: boolean
  locations: Location[]
  items: Item[]
}) {
  const [search, setSearch] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [locationFilter, setLocationFilter] = useState("all")
  const [itemFilter, setItemFilter] = useState("all")

  const scopedItems = useMemo(
    () => (typeFilter === "all" ? items : items.filter((i) => i.consumable_type === typeFilter)),
    [items, typeFilter]
  )

  function onTypeChange(value: string) {
    const next = value as TypeFilter
    setTypeFilter(next)
    if (itemFilter !== "all" && !items.some((i) => i.id === itemFilter && (next === "all" || i.consumable_type === next))) {
      setItemFilter("all")
    }
  }

  function reset() {
    setSearch("")
    setFromDate("")
    setToDate("")
    setTypeFilter("all")
    setLocationFilter("all")
    setItemFilter("all")
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter((r) => {
      if (fromDate && r.issue_date < fromDate) return false
      if (toDate && r.issue_date > toDate) return false
      const hasMatchingLine = r.material_issue_items.some((it) => matchesLine(it, typeFilter, locationFilter, itemFilter))
      if (!hasMatchingLine) return false
      if (!q) return true
      return (
        r.issue_number.toLowerCase().includes(q) ||
        (r.job_cards?.jc_number ?? "").toLowerCase().includes(q) ||
        (r.issued_to ?? "").toLowerCase().includes(q) ||
        (r.destination ?? "").toLowerCase().includes(q) ||
        r.material_issue_items.some((it) =>
          (it.item_master?.item_name ?? "").toLowerCase().includes(q) ||
          (it.item_master?.item_code ?? "").toLowerCase().includes(q))
      )
    })
  }, [records, search, fromDate, toDate, typeFilter, locationFilter, itemFilter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Material Issues</h1>
          <p className="mt-1 text-sm text-muted-foreground">Stock issued from stores for production</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(filtered, typeFilter, locationFilter, itemFilter)}
            disabled={filtered.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          {canCreate && (
            <Link href="/inventory/material-issues/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="mr-1.5 h-4 w-4" /> New Issue
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
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
          <Select value={typeFilter} onChange={(e) => onTypeChange(e.target.value)} className="mt-1">
            <option value="all">All types</option>
            <option value="wire">Wire</option>
            <option value="rod">Rod</option>
            <option value="powder">Powder</option>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Location</Label>
          <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="mt-1">
            <option value="all">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="mt-1">
            <option value="all">All materials</option>
            {scopedItems.map((i) => (
              <option key={i.id} value={i.id}>{i.item_code} — {i.item_name}</option>
            ))}
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={reset}>Reset</Button>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search issue, material, job card, operator…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title={search ? "No matches" : "No material issued yet"}
          description={
            search
              ? "Nothing matches that search. Check the spelling, or clear it to see everything."
              : "Issues record consumables leaving stores for a job card, and drive consumption reporting."
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((r) => {
            const totalIssued = r.material_issue_items.reduce((s, it) => s + Number(it.issued_qty || 0), 0)
            const uom = r.material_issue_items[0]?.uom ?? ""
            return (
              <Link
                key={r.id}
                href={`/inventory/material-issues/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.issue_number}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-sm">{materialSummary(r.material_issue_items)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        r.status === "issued" ? "bg-success-surface text-success" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {r.status === "issued" ? "Issued" : "Cancelled"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        r.consumption_status === "confirmed" ? "bg-info-surface text-info" : "bg-warning-surface text-warning"
                      )}
                    >
                      {r.consumption_status === "confirmed" ? "Usage confirmed" : "Usage pending"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.issue_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {r.job_cards?.jc_number && ` · for ${r.job_cards.jc_number}`}
                    {r.issued_to && ` · to ${r.issued_to}`}
                    {r.destination && ` · sent to ${r.destination}`}
                    {totalIssued > 0 && ` · ${formatQty(totalIssued)} ${uom}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
