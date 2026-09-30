import { requireAuth } from "@/lib/auth"
import { MaterialIssuesListClient, type IssueRow } from "@/components/inventory/material-issues-list-client"
import type { UserRole } from "@/types/database"

export default async function MaterialIssuesPage() {
  const { supabase, profile } = await requireAuth()
  const userRole = (profile?.role ?? "operator") as UserRole
  const canCreate = ["admin", "operator", "engineer"].includes(userRole)

  const [issuesRes, locationsRes, itemsRes] = await Promise.all([
    supabase
      .from("material_issues")
      .select(`
        id, issue_number, issue_date, status, consumption_status, issued_to, destination, remarks,
        job_cards(jc_number),
        material_issue_items(issued_qty, consumed_qty, returned_qty, uom, remarks, item_master(id, item_code, item_name, consumable_type), storage_locations(id, code))
      `)
      .order("issue_date", { ascending: false })
      .limit(500),
    supabase.from("storage_locations").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("item_master").select("id, item_code, item_name, consumable_type").eq("is_active", true).order("item_name"),
  ])

  return (
    <div className="p-6">
      <MaterialIssuesListClient
        records={(issuesRes.data ?? []) as unknown as IssueRow[]}
        canCreate={canCreate}
        locations={locationsRes.data ?? []}
        items={itemsRes.data ?? []}
      />
    </div>
  )
}
