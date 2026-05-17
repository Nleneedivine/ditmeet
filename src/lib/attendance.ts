export interface AttendanceRow {
  full_name: string;
  email: string;
  joined_at: string;
  left_at: string | null;
  status: string;
  is_admin: boolean;
}

export function durationLabel(joinedAt: string, leftAt: string | null): string {
  const start = new Date(joinedAt).getTime();
  const end = leftAt ? new Date(leftAt).getTime() : Date.now();
  const total = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function downloadAttendanceCSV(meetingTitle: string, rows: AttendanceRow[]) {
  const header = ["Name", "Email", "Role", "Status", "Joined at", "Left at", "Duration"];
  const csv = [header]
    .concat(
      rows.map((r) => [
        r.full_name,
        r.email,
        r.is_admin ? "Host" : "Guest",
        r.status,
        new Date(r.joined_at).toISOString(),
        r.left_at ? new Date(r.left_at).toISOString() : "(still present)",
        durationLabel(r.joined_at, r.left_at),
      ]),
    )
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meetingTitle.replace(/[^a-z0-9-]+/gi, "_")}_attendance.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function computeSummary(rows: AttendanceRow[]): {
  unique: number;
  peak: number;
  totalDurationSec: number;
} {
  const unique = new Set(rows.map((r) => r.email.toLowerCase())).size;
  // peak concurrent: sweep timeline
  const events: { t: number; d: number }[] = [];
  for (const r of rows) {
    events.push({ t: new Date(r.joined_at).getTime(), d: 1 });
    events.push({ t: (r.left_at ? new Date(r.left_at).getTime() : Date.now()), d: -1 });
  }
  events.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.d;
    if (cur > peak) peak = cur;
  }
  const totalDurationSec = rows.reduce((sum, r) => {
    const end = r.left_at ? new Date(r.left_at).getTime() : Date.now();
    return sum + Math.max(0, Math.floor((end - new Date(r.joined_at).getTime()) / 1000));
  }, 0);
  return { unique, peak, totalDurationSec };
}
