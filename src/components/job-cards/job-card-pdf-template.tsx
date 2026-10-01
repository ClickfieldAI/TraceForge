// react-pdf/renderer template — server-side only, no "use client"
//
// Deliberately mirrors the physical "RAGHAV ENGINEERING JOB CARD" paper form
// (Ref: QAF 113, Rev/0) cell-for-cell — same row grouping, same section
// order, same table columns — per an explicit client requirement that the
// generated PDF match the paper form exactly, not a redesigned layout. Every
// field below maps to a column that was added specifically for this ("0025 —
// full paper capture" in the job_cards migration), so nothing here is
// invented — where the paper form has a cell the app has no matching data
// for yet (e.g. the Hard Facing sub-columns of Drawing Size, which nothing
// in the UI captures with that specific naming), the cell prints blank
// rather than guessing.
import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"
import type {
  JobCard, Client, ProcessExecutionWithConsumable, NdeRecord, AirTestRecord,
  DimensionReport, Dispatch, OverlayChemicalEntry,
} from "@/types/database"

const S = StyleSheet.create({
  page:      { fontFamily: "Helvetica", fontSize: 7.5, padding: 18, color: "#111" },
  outer:     { borderWidth: 1.5, borderColor: "#111" },

  headerRow: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#111" },
  logoBox:   { width: 70, borderRightWidth: 1, borderRightColor: "#111", alignItems: "center", justifyContent: "center", padding: 4 },
  logoText:  { fontSize: 16, fontFamily: "Helvetica-Bold" },
  titleBox:  { flex: 1, borderRightWidth: 1, borderRightColor: "#111", alignItems: "center", justifyContent: "center", padding: 4 },
  titleMain: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  titleSub:  { fontSize: 13, fontFamily: "Helvetica-Bold" },
  jcBox:     { width: 190, padding: 3 },
  jcLine:    { flexDirection: "row", marginBottom: 1 },
  jcLabel:   { fontFamily: "Helvetica-Bold", width: 46 },
  jcValue:   { flex: 1 },

  // A 3-cell "Label : value" row, repeated for most of the header block.
  row3:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111" },
  cell3:     { flex: 1, flexDirection: "row", borderRightWidth: 1, borderRightColor: "#111", padding: 2 },
  cell3last: { flex: 1, flexDirection: "row", padding: 2 },
  lbl:       { fontFamily: "Helvetica-Bold" },
  val:       { flex: 1 },

  sectionBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111", backgroundColor: "#e5e5e5" },
  sectionTxt: { fontFamily: "Helvetica-Bold", fontSize: 8, padding: 3, textTransform: "uppercase" },

  gridHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111", backgroundColor: "#f0f0f0" },
  gridHCell:  { borderRightWidth: 1, borderRightColor: "#111", paddingVertical: 4, paddingHorizontal: 3, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "center" },
  gridRow:    { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111" },
  gridCell:   { borderRightWidth: 1, borderRightColor: "#111", paddingVertical: 4, paddingHorizontal: 3, fontSize: 7, textAlign: "center" },
  gridCellTall: { borderRightWidth: 1, borderRightColor: "#111", minHeight: 16 },

  footer:    { textAlign: "center", fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3 },
})

function fmtDate(d?: string | null): string {
  if (!d) return ""
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function v(x: string | number | null | undefined): string {
  return x === null || x === undefined ? "" : String(x)
}

/** One "Label : value" cell, used three-per-row throughout the header block. */
function LV({ label, value, last }: { label: string; value: string | number | null | undefined; last?: boolean }) {
  return (
    <View style={last ? S.cell3last : S.cell3}>
      <Text style={S.lbl}>{label} : </Text>
      <Text style={S.val}>{v(value)}</Text>
    </View>
  )
}

function Row3({ a, b, c }: { a: React.ReactNode; b: React.ReactNode; c: React.ReactNode }) {
  return <View style={S.row3}>{a}{b}{c}</View>
}

function SectionBar({ children }: { children: React.ReactNode }) {
  return <View style={S.sectionBar}><Text style={S.sectionTxt}>{children}</Text></View>
}

const WELDING_FAMILY = ["welding", "cladding", "overlay"]

type ExecRow = ProcessExecutionWithConsumable & {
  machine?: { machine_code: string; name: string } | null
}

function isWeldingExec(e: ExecRow): boolean {
  if (e.operation_type) return e.operation_type === "welding"
  return WELDING_FAMILY.includes(e.process_type)
}

// Welding Details table — one column per weld parameter, one row per
// instance (the WPS-required row, the overall Actual row, then one row per
// dated welding pass), matching the paper form's horizontal layout exactly
// (the original template ran this the other way — one row per parameter).
const WELD_COLS = [
  { key: "qty",     label: "Actual Qty",           width: 52 },
  { key: "date",    label: "Weld Date",            width: 48 },
  { key: "preheat", label: "Pre Heat temp",        width: 52 },
  { key: "inter",   label: "Inter-pass temp",      width: 52 },
  { key: "post",    label: "Post Heat temp",       width: 52 },
  { key: "amp",     label: "Amp",                  width: 42 },
  { key: "volt",    label: "Volt",                 width: 42 },
  { key: "travel",  label: "Travel Speed",         width: 54 },
  { key: "gas",     label: "Gas flow rate",        width: 50 },
  { key: "feed",    label: "Consumable feed rate", width: 54 },
  { key: "pol",     label: "Polarity",             width: 50 },
] as const

type WeldTableRow = Record<(typeof WELD_COLS)[number]["key"], string>

function weldRows(executions: ExecRow[]): WeldTableRow[] {
  const welds = executions.filter(isWeldingExec)
  if (welds.length === 0) return []
  const first = welds[0]

  const wpsRow: WeldTableRow = {
    qty: "As Per wp's", date: "",
    preheat: v(first.pre_heat_temp_planned), inter: v(first.inter_pass_temp_planned), post: v(first.post_heat_temp_planned),
    amp: v(first.amps_required), volt: v(first.volts_required), travel: v(first.travel_speed_planned),
    gas: v(first.gas_flow_rate_planned), feed: v(first.consumable_feed_rate_planned), pol: v(first.polarity_planned),
  }
  const actualSummaryRow: WeldTableRow = {
    qty: "Actual", date: "",
    preheat: "", inter: "", post: "",
    amp: v(first.amps_actual), volt: v(first.volts_actual), travel: v(first.travel_speed),
    gas: "", feed: "", pol: "",
  }
  const dated: WeldTableRow[] = welds.map((e) => ({
    qty: v(e.weld_qty_actual), date: fmtDate(e.weld_date),
    preheat: v(e.pre_heat_temp), inter: v(e.inter_pass_temp), post: v(e.post_heat_temp),
    amp: v(e.amps_actual), volt: v(e.volts_actual), travel: v(e.travel_speed),
    gas: v(e.gas_flow_rate), feed: v(e.consumable_feed_rate), pol: v(e.polarity),
  }))
  return [wpsRow, actualSummaryRow, ...dated]
}

// Always printed, like the paper form's pre-printed row labels — filled in
// when a matching chemical_type exists in the NDE record's data, blank
// otherwise, never hidden for lack of data.
const CHEM_ROW_TYPES = ["Penetrant", "Cleaner", "Developer"] as const

// Two sub-groups of the paper form's "Drawing Size" table. Nothing in the
// current dimension-entry UI captures values under these exact names yet
// (it captures a free-form dimensions array), so this renders the header
// grid faithfully and fills a cell only when a dimension entry's name
// matches — blank otherwise, rather than inventing a value.
const DRAWING_SIZE_GROUPS = [
  { group: "Milling",              cols: ["GSM", "PSM"] },
  { group: "Soft / Pre Machining", cols: ["OAL", "OD", "ID", "Top/OAH"] },
  { group: "Hard Facing",          cols: ["OD", "ID", "Top/OAH"] },
] as const

function findDimensionValue(dimensions: Record<string, unknown>[] | null | undefined, name: string, occurrence: number): string {
  if (!Array.isArray(dimensions)) return ""
  const matches = dimensions.filter((d) => String(d.dimension_name ?? "").trim().toLowerCase() === name.toLowerCase())
  const row = matches[occurrence]
  if (!row) return ""
  const val = row.actual_value_1 ?? row.required_dimension
  return val === null || val === undefined ? "" : String(val)
}

export function JobCardPdfTemplate({
  jobCard, client, executions, ndeRecords, airTests, dimensionReports, dispatches, pwhtRuns,
}: {
  jobCard: JobCard
  client: Client | null
  executions: ExecRow[]
  ndeRecords: NdeRecord[]
  airTests: AirTestRecord[]
  dimensionReports: DimensionReport[]
  dispatches: Dispatch[]
  pwhtRuns: {
    chart_number: string; process_name: string | null
    loading_temp: number; loading_time: number | null
    soaking_temp: number; soaking_time: number
    unloading_temp: number | null; unloading_time: number | null
  }[]
}) {
  const nde = ndeRecords[0]
  const pwht = pwhtRuns[0]
  const air = airTests[0]
  const dim = dimensionReports[0]
  const dispatch = dispatches[0]
  const chemicals = (nde?.chemicals_used_json as unknown as OverlayChemicalEntry[] | null) ?? []
  const chemByType = new Map(chemicals.map((c) => [c.chemical_type.toLowerCase(), c]))
  const wRows = weldRows(executions)

  // Cumulative occurrence index so a dimension name that legitimately
  // repeats (e.g. "OD" under both Soft/Pre Machining and Hard Facing) reads
  // its own distinct entry rather than the same one twice.
  const seen = new Map<string, number>()
  function nextValue(name: string): string {
    const n = (seen.get(name) ?? 0)
    seen.set(name, n + 1)
    return findDimensionValue(dim?.dimensions, name, n)
  }

  return (
    <Document title={`Job Card — ${jobCard.jc_number}`}>
      <Page size="A4" style={S.page}>
        <View style={S.outer}>

          {/* Header: logo | title | J.C. No / Date / Process */}
          <View style={S.headerRow}>
            <View style={S.logoBox}><Text style={S.logoText}>RE</Text></View>
            <View style={S.titleBox}>
              <Text style={S.titleMain}>RAGHAV ENGINEERING</Text>
              <Text style={S.titleSub}>JOB CARD</Text>
            </View>
            <View style={S.jcBox}>
              <View style={S.jcLine}><Text style={S.jcLabel}>J.C. No.</Text><Text style={S.jcValue}>: {v(jobCard.jc_number)}</Text></View>
              <View style={S.jcLine}><Text style={S.jcLabel}>Date</Text><Text style={S.jcValue}>: {fmtDate(jobCard.received_date)}</Text></View>
              <View style={S.jcLine}><Text style={S.jcLabel}>Process</Text></View>
              <Text style={{ fontSize: 6 }}>SAW/PTAW/GTAW/GMAW/SMAW/MACHINING/FCAW</Text>
            </View>
          </View>

          <Row3
            a={<LV label="Customer" value={client?.name} />}
            b={<LV label="Product Group" value={jobCard.product_group} />}
            c={<LV label="Buyer" value={jobCard.buyer} last />}
          />
          <Row3
            a={<LV label="Description" value={jobCard.description} />}
            b={<LV label="Qty" value={jobCard.quantity} />}
            c={<LV label="Part No." value={jobCard.part_number} last />}
          />
          <Row3
            a={<LV label="Ring" value={jobCard.ring} />}
            b={<LV label="Ring Heat No." value={jobCard.ring_heat_no} />}
            c={<LV label="P.O. No." value={jobCard.po_number} last />}
          />
          <Row3
            a={<LV label="NBDN No." value={jobCard.nbdn_number} />}
            b={<LV label="Regularization" value={jobCard.regularization} />}
            c={<LV label="Heat No." value={jobCard.heat_number} last />}
          />
          <Row3
            a={<LV label="Drawing No." value={jobCard.drawing_number} />}
            b={<LV label="WPS No." value={jobCard.wps_no} />}
            c={<LV label="Mpi / Rt No." value={jobCard.mpi_rt_no} last />}
          />

          {/* Consumable Data */}
          <View style={S.gridHeader}>
            <Text style={[S.gridHCell, { width: 90, textAlign: "left" }]}>Consumable Data</Text>
            {["Brand", "AWS No.", "Size", "Batch No", "MFG. Date"].map((h) => (
              <Text key={h} style={[S.gridHCell, { flex: 1 }]}>{h}</Text>
            ))}
          </View>
          <View style={S.gridRow}>
            <Text style={[S.gridCell, { width: 90 }]} />
            <Text style={[S.gridCell, { flex: 1 }]}>{v(jobCard.consumable_brand)}</Text>
            <Text style={[S.gridCell, { flex: 1 }]}>{v(jobCard.consumable_aws_class)}</Text>
            <Text style={[S.gridCell, { flex: 1 }]}>{v(jobCard.consumable_size)}</Text>
            <Text style={[S.gridCell, { flex: 1 }]}>{v(jobCard.consumable_batch_no)}</Text>
            <Text style={[S.gridCell, { flex: 1, borderRightWidth: 0 }]}>{fmtDate(jobCard.consumable_mfg_date)}</Text>
          </View>

          {/* Welding Details */}
          <SectionBar>Welding Details</SectionBar>
          <Row3
            a={<LV label="Welder Name" value={executions.find(isWeldingExec)?.welder_name} />}
            b={<LV label="Weld Metal" value={executions.find(isWeldingExec)?.weld_metal} />}
            c={<LV label="Weld Height" value={executions.find(isWeldingExec)?.weld_height} last />}
          />
          {wRows.length > 0 && (
            <>
              <View style={S.gridHeader}>
                {WELD_COLS.map((c, ci) => (
                  <Text
                    key={c.key}
                    style={[S.gridHCell, ci === WELD_COLS.length - 1 ? { flex: 1, borderRightWidth: 0 } : { width: c.width }]}
                  >
                    {c.label}
                  </Text>
                ))}
              </View>
              {wRows.map((row, i) => (
                <View key={i} style={S.gridRow}>
                  {WELD_COLS.map((c, ci) => (
                    <Text
                      key={c.key}
                      style={[S.gridCell, ci === WELD_COLS.length - 1 ? { flex: 1, borderRightWidth: 0 } : { width: c.width }]}
                    >
                      {row[c.key]}
                    </Text>
                  ))}
                </View>
              ))}
            </>
          )}

          {/* PWHT Details */}
          <SectionBar>PWHT Details</SectionBar>
          <Row3
            a={<LV label="H. Chart No." value={pwht?.chart_number} />}
            b={<LV label="Process" value={pwht?.process_name} last />}
            c={<></>}
          />
          <Row3
            a={<LV label="Loading Temp" value={pwht?.loading_temp} />}
            b={<LV label="Loading Time" value={pwht?.loading_time} last />}
            c={<></>}
          />
          <Row3
            a={<LV label="Soaking Temp" value={pwht?.soaking_temp} />}
            b={<LV label="Soaking Time" value={pwht?.soaking_time} last />}
            c={<></>}
          />
          <Row3
            a={<LV label="Unloading Temp" value={pwht?.unloading_temp} />}
            b={<LV label="Unloading Time" value={pwht?.unloading_time} last />}
            c={<></>}
          />

          {/* Air Testing & Inspection */}
          <SectionBar>Air Testing &amp; Inspection</SectionBar>
          <Row3
            a={<LV label="Tester Name" value={air?.tester_name} />}
            b={<LV label="Pressure" value={air?.pressure} />}
            c={<LV label="Duration" value={air?.duration} last />}
          />
          <View style={S.row3}>
            <LV label="Result" value={air?.result} last />
          </View>

          {/* Non Destructive Examinations */}
          <SectionBar>Non Destructive Examinations</SectionBar>
          <Row3
            a={<LV label="Test Coupon No." value={nde?.test_coupon_number} />}
            b={<LV label="Deposit Thickness" value={nde?.deposit_thickness} />}
            c={<LV label="Hardness, Req" value={nde?.hardness_requirement} last />}
          />
          <Row3
            a={<LV label="NDE No" value={nde?.nde_number} />}
            b={<LV label="NDE Report No" value={nde?.report_number} />}
            c={<LV label="Duration" value={nde?.duration} last />}
          />
          <Row3
            a={<LV label="Obser" value={nde?.observer} />}
            b={<LV label="Result" value={nde?.result} />}
            c={<></>}
          />
          <View style={S.gridHeader}>
            <Text style={[S.gridHCell, { flex: 1, textAlign: "left" }]}>Chemical Name</Text>
            <Text style={[S.gridHCell, { flex: 1 }]}>Batch No.</Text>
            <Text style={[S.gridHCell, { flex: 1 }]}>Manufacturer&apos;s Name</Text>
            <Text style={[S.gridHCell, { flex: 1, borderRightWidth: 0 }]}>Expiry Date</Text>
          </View>
          {CHEM_ROW_TYPES.map((t) => {
            const c = chemByType.get(t.toLowerCase())
            return (
              <View key={t} style={S.gridRow}>
                <Text style={[S.gridCell, { flex: 1, textAlign: "left" }]}>{t}</Text>
                <Text style={[S.gridCell, { flex: 1 }]}>{v(c?.batch_no)}</Text>
                <Text style={[S.gridCell, { flex: 1 }]}>{v(c?.manufacturer)}</Text>
                <Text style={[S.gridCell, { flex: 1, borderRightWidth: 0 }]}>{v(c?.expiry_date)}</Text>
              </View>
            )
          })}

          {/* Machining */}
          <SectionBar>Machining</SectionBar>
          <Row3
            a={<LV label="Machine Name" value={dim?.machine_name} />}
            b={<LV label="Operator" value={dim?.operator} last />}
            c={<></>}
          />
          <View style={S.gridHeader}>
            {DRAWING_SIZE_GROUPS.map((g, gi) => (
              <Text
                key={g.group}
                style={[S.gridHCell, gi === DRAWING_SIZE_GROUPS.length - 1 ? { flex: g.cols.length, borderRightWidth: 0 } : { flex: g.cols.length }]}
              >
                {g.group}
              </Text>
            ))}
          </View>
          <View style={S.gridHeader}>
            {DRAWING_SIZE_GROUPS.flatMap((g) => g.cols).map((c, i, arr) => (
              <Text
                key={`${c}-${i}`}
                style={[S.gridHCell, { flex: 1 }, i === arr.length - 1 ? { borderRightWidth: 0 } : {}]}
              >
                {c}
              </Text>
            ))}
          </View>
          <View style={S.gridRow}>
            {DRAWING_SIZE_GROUPS.flatMap((g) => g.cols).map((c, i, arr) => (
              <Text
                key={`${c}-${i}`}
                style={[S.gridCell, { flex: 1 }, i === arr.length - 1 ? { borderRightWidth: 0 } : {}]}
              >
                {nextValue(c)}
              </Text>
            ))}
          </View>
          {/* 4 blank rows, taller than the data row above — for additional
              pieces' readings or handwritten notes, same as the paper form. */}
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={S.gridRow}>
              {DRAWING_SIZE_GROUPS.flatMap((g) => g.cols).map((c, i, arr) => (
                <Text
                  key={`${c}-${i}`}
                  style={[S.gridCellTall, { flex: 1 }, i === arr.length - 1 ? { borderRightWidth: 0 } : {}]}
                />
              ))}
            </View>
          ))}

          <Row3
            a={<LV label="Weld Deposit Thickness" value={jobCard.weld_deposit_thickness_before} />}
            b={<LV label="After M/C Weld Deposit thickness" value={jobCard.weld_deposit_thickness_after} last />}
            c={<></>}
          />
          <Row3 a={<LV label="Punching Details" value={jobCard.punching_details} last />} b={<></>} c={<></>} />
          <Row3
            a={<LV label="Despatch DC No." value={dispatch?.dc_number ?? jobCard.despatch_dc_no} />}
            b={<LV label="Date" value={fmtDate(dispatch?.dispatch_date ?? jobCard.despatch_date)} last />}
            c={<></>}
          />
          <Row3 a={<LV label="Other Details" value={jobCard.other_details} last />} b={<></>} c={<></>} />

          <Row3
            a={<LV label="Production" value={jobCard.production_checked_by} />}
            b={<LV label="Quality Control" value={jobCard.qc_checked_by} />}
            c={<LV label="Stores" value={jobCard.stores_checked_by} last />}
          />

          <Text style={S.footer}>Ref: QAF 113, Rev/0</Text>
        </View>
      </Page>
    </Document>
  )
}
