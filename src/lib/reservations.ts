// Pure business logic for reservations — importable by tests without Next.js runtime

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export interface TableLayout {
  id: string
  storeId: string
  number: string
  capacity: number
  section: string
  active: boolean | number
}

export interface ReservationRow {
  id: string
  storeId: string
  customerId?: string | null
  customerName: string
  customerPhone: string
  tableId: string
  partySize: number
  date: string      // YYYY-MM-DD
  timeSlot: string  // HH:MM
  status: ReservationStatus
  notes?: string | null
  createdAt: string
}

export const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING:   ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED:    ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW:   [],
}

/** Returns true when `next` is a valid transition from `current`. */
export function isValidTransition(current: ReservationStatus, next: ReservationStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false
}

/** Returns true when a reservation's party fits in the table's capacity. */
export function partySizeFitsTable(partySize: number, tableCapacity: number): boolean {
  return partySize > 0 && partySize <= tableCapacity
}

/**
 * Returns true when two reservations conflict on the same table.
 * Two reservations conflict if they share the same tableId, date, and timeSlot,
 * and neither is CANCELLED or NO_SHOW.
 */
export function reservationsConflict(a: ReservationRow, b: ReservationRow): boolean {
  if (a.id === b.id) return false
  const terminal: ReservationStatus[] = ['CANCELLED', 'NO_SHOW', 'COMPLETED']
  if (terminal.includes(a.status) || terminal.includes(b.status)) return false
  return a.tableId === b.tableId && a.date === b.date && a.timeSlot === b.timeSlot
}

/**
 * Given a list of tables and existing reservations, return the tables that are
 * available for the requested date/timeSlot/partySize.
 */
export function findAvailableTables(
  tables: TableLayout[],
  reservations: ReservationRow[],
  date: string,
  timeSlot: string,
  partySize: number,
): TableLayout[] {
  const terminal: ReservationStatus[] = ['CANCELLED', 'NO_SHOW', 'COMPLETED']
  const occupied = new Set(
    reservations
      .filter(r => r.date === date && r.timeSlot === timeSlot && !terminal.includes(r.status))
      .map(r => r.tableId),
  )
  return tables.filter(
    t => Boolean(t.active) && !occupied.has(t.id) && partySizeFitsTable(partySize, t.capacity),
  )
}

/**
 * Detects whether a CONFIRMED reservation should be marked NO_SHOW.
 * A reservation is a no-show if its date+timeSlot is more than `thresholdMinutes`
 * in the past and it is still CONFIRMED.
 */
export function isNoShow(
  reservation: ReservationRow,
  nowISO: string,
  thresholdMinutes = 30,
): boolean {
  if (reservation.status !== 'CONFIRMED') return false
  const slotDate = new Date(`${reservation.date}T${reservation.timeSlot}:00.000Z`)
  const now = new Date(nowISO)
  const diffMs = now.getTime() - slotDate.getTime()
  return diffMs >= thresholdMinutes * 60 * 1000
}
