import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface SummaryContent {
  overview?: string;
  action_items?: Array<{ owner: string; text: string; due?: string }>;
  key_points?: string[];
  decisions?: string[];
  typo_flags?: Array<{ original: string; suggestion: string; reason: string }>;
}

export interface TranscriptLine {
  speaker_name: string;
  text: string;
  started_at: string;
}

export interface AttendanceItem {
  full_name: string;
  email: string | null;
  joined_at: string;
  left_at: string | null;
}

export function generateSummaryPdf(args: {
  meetingTitle: string;
  startedAt?: string | null;
  endedAt?: string | null;
  summary: SummaryContent;
  transcript: TranscriptLine[];
  attendance: AttendanceItem[];
  hostNotes?: Array<{ text: string }>;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const page = doc.internal.pageSize;
  const margin = 40;
  let y = margin;

  // Header band
  doc.setFillColor(10, 26, 58); // DIT navy
  doc.rect(0, 0, page.getWidth(), 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("DIT Meet · Summary", margin, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Divine Intelligence Team", margin, 58);
  y = 100;

  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(args.meetingTitle, margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  const when =
    args.startedAt && args.endedAt
      ? `${new Date(args.startedAt).toLocaleString()} → ${new Date(args.endedAt).toLocaleString()}`
      : args.startedAt
        ? new Date(args.startedAt).toLocaleString()
        : "";
  if (when) {
    doc.text(when, margin, y);
    y += 18;
  }

  const section = (title: string) => {
    if (y > page.getHeight() - 80) {
      doc.addPage();
      y = margin;
    }
    doc.setTextColor(124, 195, 240); // DIT sky blue
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, margin, y);
    y += 16;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  const writeWrapped = (text: string, indent = 0) => {
    const lines = doc.splitTextToSize(text, page.getWidth() - margin * 2 - indent);
    for (const line of lines) {
      if (y > page.getHeight() - 60) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin + indent, y);
      y += 14;
    }
  };

  if (args.summary.overview) {
    section("Overview");
    writeWrapped(args.summary.overview);
    y += 6;
  }

  if (args.summary.action_items?.length) {
    section("Action Items");
    autoTable(doc, {
      startY: y,
      head: [["Owner", "Task", "Due"]],
      body: args.summary.action_items.map((a) => [a.owner, a.text, a.due ?? ""]),
      headStyles: { fillColor: [10, 26, 58], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 6 },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  if (args.summary.key_points?.length) {
    section("Key Points");
    args.summary.key_points.forEach((p) => writeWrapped(`• ${p}`));
    y += 6;
  }

  if (args.summary.decisions?.length) {
    section("Decisions");
    args.summary.decisions.forEach((p) => writeWrapped(`• ${p}`));
    y += 6;
  }

  if (args.hostNotes?.length) {
    section("Host Notes");
    args.hostNotes.forEach((n) => writeWrapped(`• ${n.text}`));
    y += 6;
  }

  if (args.attendance.length) {
    section("Attendance");
    autoTable(doc, {
      startY: y,
      head: [["Name", "Email", "Joined", "Left"]],
      body: args.attendance.map((a) => [
        a.full_name,
        a.email ?? "—",
        new Date(a.joined_at).toLocaleString(),
        a.left_at ? new Date(a.left_at).toLocaleString() : "—",
      ]),
      headStyles: { fillColor: [10, 26, 58], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 6 },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  if (args.transcript.length) {
    section("Transcript");
    autoTable(doc, {
      startY: y,
      head: [["Time", "Speaker", "Text"]],
      body: args.transcript.map((t) => [
        new Date(t.started_at).toISOString().substring(11, 19),
        t.speaker_name,
        t.text,
      ]),
      headStyles: { fillColor: [10, 26, 58], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 80 } },
      margin: { left: margin, right: margin },
    });
  }

  if (args.summary.typo_flags?.length) {
    doc.addPage();
    y = margin;
    section("AI Transcription Flags");
    autoTable(doc, {
      startY: y,
      head: [["Original", "Suggestion", "Reason"]],
      body: args.summary.typo_flags.map((f) => [f.original, f.suggestion, f.reason]),
      headStyles: { fillColor: [10, 26, 58], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 6 },
      margin: { left: margin, right: margin },
    });
  }

  const safe = args.meetingTitle.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "meeting";
  doc.save(`ditm-summary-${safe}.pdf`);
}
