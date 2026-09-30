import type { SupabaseClient } from "@supabase/supabase-js"

type LedgerRowRef = { id: string; reference_type: string; reference_id: string }

export type RowDetail = { supplierCustomer: string | null; remarks: string | null }

type GrnRow = {
  id: string
  remarks: string | null
  material_inward: { source_type: string; suppliers: { name: string } | null; clients: { name: string } | null } | null
}
type IssueRow = {
  id: string
  remarks: string | null
  issued_to: string | null
  destination: string | null
  job_cards: { clients: { name: string } | null } | null
}

/**
 * stock_ledger.reference_id is polymorphic (its target table depends on
 * reference_type), so Supabase can't nested-select across it directly — no
 * single FK to declare. Instead: collect the distinct reference_ids per
 * reference_type, do one bulk lookup per source table, and map back onto
 * each ledger row by id. Bounded by the already-date-filtered ledger rows
 * the caller passes in, not the whole table.
 *
 * A GRN's "customer" concept doesn't normally apply since it's material
 * coming IN, but material can arrive as a client's own material for a job
 * (source_type), so both supplier and client are checked there. 'adjustment'
 * and 'transfer' rows never get a Supplier/Customer value — only their
 * reason, surfaced as remarks.
 */
export async function resolveLedgerRowDetails(
  supabase: SupabaseClient,
  rows: LedgerRowRef[],
): Promise<Map<string, RowDetail>> {
  const details = new Map<string, RowDetail>()

  const grnIds = Array.from(new Set(rows.filter((r) => r.reference_type === "grn").map((r) => r.reference_id)))
  const issueIds = Array.from(new Set(rows.filter((r) => r.reference_type === "material_issue").map((r) => r.reference_id)))
  const adjustmentIds = Array.from(new Set(rows.filter((r) => r.reference_type === "adjustment").map((r) => r.reference_id)))
  const transferIds = Array.from(new Set(rows.filter((r) => r.reference_type === "transfer").map((r) => r.reference_id)))

  const [grnRes, issueRes, adjustmentRes, transferRes] = await Promise.all([
    grnIds.length
      ? supabase
          .from("grn")
          .select("id, remarks, material_inward(source_type, suppliers(name), clients(name))")
          .in("id", grnIds)
      : Promise.resolve({ data: [] as GrnRow[] }),
    issueIds.length
      ? supabase
          .from("material_issues")
          .select("id, remarks, issued_to, destination, job_cards(clients(name))")
          .in("id", issueIds)
      : Promise.resolve({ data: [] as IssueRow[] }),
    adjustmentIds.length
      ? supabase.from("stock_adjustments").select("id, reason").in("id", adjustmentIds)
      : Promise.resolve({ data: [] as { id: string; reason: string }[] }),
    transferIds.length
      ? supabase.from("stock_transfers").select("id, reason").in("id", transferIds)
      : Promise.resolve({ data: [] as { id: string; reason: string }[] }),
  ])

  const grnById = new Map(((grnRes.data ?? []) as unknown as GrnRow[]).map((g) => [g.id, g]))
  const issueById = new Map(((issueRes.data ?? []) as unknown as IssueRow[]).map((i) => [i.id, i]))
  const adjustmentById = new Map(((adjustmentRes.data ?? []) as { id: string; reason: string }[]).map((a) => [a.id, a.reason]))
  const transferById = new Map(((transferRes.data ?? []) as { id: string; reason: string }[]).map((t) => [t.id, t.reason]))

  for (const r of rows) {
    if (r.reference_type === "grn") {
      const g = grnById.get(r.reference_id)
      const supplierCustomer = g?.material_inward?.suppliers?.name ?? g?.material_inward?.clients?.name ?? null
      details.set(r.id, { supplierCustomer, remarks: g?.remarks ?? null })
    } else if (r.reference_type === "material_issue") {
      const i = issueById.get(r.reference_id)
      const supplierCustomer = i?.job_cards?.clients?.name ?? i?.issued_to ?? i?.destination ?? null
      details.set(r.id, { supplierCustomer, remarks: i?.remarks ?? null })
    } else if (r.reference_type === "adjustment") {
      details.set(r.id, { supplierCustomer: null, remarks: adjustmentById.get(r.reference_id) ?? null })
    } else if (r.reference_type === "transfer") {
      details.set(r.id, { supplierCustomer: null, remarks: transferById.get(r.reference_id) ?? null })
    } else {
      details.set(r.id, { supplierCustomer: null, remarks: null })
    }
  }

  return details
}
