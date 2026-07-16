/**
 * ICS (iCalendar) generator for exporting plugin data to .ics format.
 * Generates RFC 5545 compliant VCALENDAR files.
 */

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function getNowIcs(): string {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0")
  );
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: string; // YYYYMMDD or YYYYMMDDTHHMMSS
  dtend?: string;
  allday?: boolean;
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
  categories?: string[];
}

function buildVevent(event: IcsEvent, now: string): string {
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${now}`,
    `LAST-MODIFIED:${now}`,
  ];

  if (event.allday) {
    lines.push(`DTSTART;VALUE=DATE:${event.dtstart}`);
    if (event.dtend) {
      lines.push(`DTEND;VALUE=DATE:${event.dtend}`);
    }
  } else {
    // Timed events — use local time (no timezone conversion)
    lines.push(`DTSTART:${event.dtstart}`);
    if (event.dtend) {
      lines.push(`DTEND:${event.dtend}`);
    }
  }

  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }

  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }

  if (event.categories && event.categories.length > 0) {
    lines.push(`CATEGORIES:${event.categories.map(escapeIcsText).join(",")}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function generateIcs(events: IcsEvent[]): string {
  const now = getNowIcs();
  const vevents = events.map((e) => buildVevent(e, now)).join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendar Plugin Remastered//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Obsidian Calendar",
    vevents,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
