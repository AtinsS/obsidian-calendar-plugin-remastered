import { generateIcs, type IcsEvent } from "../../finance/icsGenerator";

describe("ICS Generator", () => {
  it("should generate valid VCALENDAR wrapper", () => {
    const ics = generateIcs([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Calendar Plugin Remastered//EN");
    expect(ics).toContain("CALSCALE:GREGOR");
    expect(ics).toContain("METHOD:PUBLISH");
  });

  it("should generate a single VEVENT for an all-day event", () => {
    const events: IcsEvent[] = [
      {
        uid: "test-1@test",
        summary: "Тестовое событие",
        dtstart: "20260715",
        allday: true,
      },
    ];
    const ics = generateIcs(events);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:test-1@test");
    expect(ics).toContain("SUMMARY:Тестовое событие");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260715");
    expect(ics).toContain("END:VEVENT");
  });

  it("should generate VEVENT with description", () => {
    const events: IcsEvent[] = [
      {
        uid: "test-2@test",
        summary: "С описанием",
        description: "Описание события",
        dtstart: "20260715",
        allday: true,
      },
    ];
    const ics = generateIcs(events);
    expect(ics).toContain("DESCRIPTION:Описание события");
  });

  it("should escape special characters in text", () => {
    const events: IcsEvent[] = [
      {
        uid: "test-3@test",
        summary: "Тест;с,запятыми",
        dtstart: "20260715",
        allday: true,
      },
    ];
    const ics = generateIcs(events);
    expect(ics).toContain("SUMMARY:Тест\\;с\\,запятыми");
  });

  it("should generate timed event (not all-day)", () => {
    const events: IcsEvent[] = [
      {
        uid: "test-4@test",
        summary: "Встреча",
        dtstart: "20260715T140000",
        dtend: "20260715T150000",
        allday: false,
      },
    ];
    const ics = generateIcs(events);
    expect(ics).toContain("DTSTART:20260715T140000");
    expect(ics).toContain("DTEND:20260715T150000");
    // Should NOT have VALUE=DATE for timed events
    expect(ics).not.toContain("DTSTART;VALUE=DATE:20260715T140000");
  });

  it("should include categories", () => {
    const events: IcsEvent[] = [
      {
        uid: "test-5@test",
        summary: "С категориями",
        dtstart: "20260715",
        allday: true,
        categories: ["Работа", "Важное"],
      },
    ];
    const ics = generateIcs(events);
    expect(ics).toContain("CATEGORIES:Работа,Важное");
  });

  it("should include status", () => {
    const events: IcsEvent[] = [
      {
        uid: "test-6@test",
        summary: "Подтверждено",
        dtstart: "20260715",
        allday: true,
        status: "CONFIRMED",
      },
    ];
    const ics = generateIcs(events);
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("should generate multiple VEVENTs", () => {
    const events: IcsEvent[] = [
      { uid: "a@test", summary: "Первое", dtstart: "20260715", allday: true },
      { uid: "b@test", summary: "Второе", dtstart: "20260716", allday: true },
      { uid: "c@test", summary: "Третье", dtstart: "20260717", allday: true },
    ];
    const ics = generateIcs(events);
    const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(veventCount).toBe(3);
  });

  it("should produce RFC-compliant line endings (CRLF)", () => {
    const events: IcsEvent[] = [
      { uid: "test@test", summary: "Тест", dtstart: "20260715", allday: true },
    ];
    const ics = generateIcs(events);
    // Each line should end with \r\n
    const lines = ics.split("\r\n");
    expect(lines.length).toBeGreaterThan(5);
    // Check that no bare \n exists (except possibly trailing)
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("should handle empty description by omitting it", () => {
    const events: IcsEvent[] = [
      { uid: "test@test", summary: "Без описания", dtstart: "20260715", allday: true },
    ];
    const ics = generateIcs(events);
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("should handle empty categories by omitting them", () => {
    const events: IcsEvent[] = [
      { uid: "test@test", summary: "Без категорий", dtstart: "20260715", allday: true, categories: [] },
    ];
    const ics = generateIcs(events);
    expect(ics).not.toContain("CATEGORIES:");
  });
});
