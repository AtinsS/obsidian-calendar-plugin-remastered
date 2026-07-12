import { parseSavingsInput } from "../inputUtils";

describe("parseSavingsInput", () => {
  test("parses percent input with %", () => {
    const res = parseSavingsInput("10%", 10000);
    expect(res.percent).toBe(10);
    expect(res.amount).toBe(1000);
  });

  test("parses percent with comma", () => {
    const res = parseSavingsInput("12,5%", 8000);
    expect(res.percent).toBe(13);
    expect(res.amount).toBe(Math.round(8000 * 13 / 100));
  });

  test("parses raw amount", () => {
    const res = parseSavingsInput("1500", 10000);
    expect(res.amount).toBe(1500);
    expect(res.percent).toBe(15);
  });

  test("parses amount with currency symbol", () => {
    const res = parseSavingsInput("1 200 ₽", 12000);
    expect(res.amount).toBe(1200);
    expect(res.percent).toBe(10);
  });

  test("invalid input returns zeros", () => {
    const res = parseSavingsInput("abc", 10000);
    expect(res.amount).toBe(0);
    expect(res.percent).toBe(0);
  });
});
