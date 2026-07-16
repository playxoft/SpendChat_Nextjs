import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("emits a header-only document", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });

  it("joins rows with CRLF (RFC 4180)", () => {
    expect(toCsv(["A", "B"], [["1", "2"], ["3", "4"]])).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    expect(toCsv(["A"], [["a,b"]])).toBe('A\r\n"a,b"');
    expect(toCsv(["A"], [["line\nbreak"]])).toBe('A\r\n"line\nbreak"');
    expect(toCsv(["A"], [["carriage\rreturn"]])).toBe('A\r\n"carriage\rreturn"');
  });

  it("doubles embedded double-quotes", () => {
    expect(toCsv(["A"], [['say "hi"']])).toBe('A\r\n"say ""hi"""');
  });

  it("renders null/undefined as empty and numbers as text", () => {
    expect(toCsv(["A", "B", "C"], [[null, undefined, 42]])).toBe("A,B,C\r\n,,42");
  });
});

describe("toCsv — formula injection (B6)", () => {
  it("neutralises cells that Excel/Sheets would execute", () => {
    expect(toCsv(["A"], [["=cmd|'/c calc'!A1"]])).toBe(`A\r\n"'=cmd|'/c calc'!A1"`);
    expect(toCsv(["A"], [["@SUM(1,2)"]])).toBe(`A\r\n"'@SUM(1,2)"`);
    expect(toCsv(["A"], [["+1+1"]])).toBe(`A\r\n"'+1+1"`);
    expect(toCsv(["A"], [["-1-1"]])).toBe(`A\r\n"'-1-1"`);
    expect(toCsv(["A"], [["\tTabbed"]])).toBe(`A\r\n"'\tTabbed"`);
  });

  it("leaves genuine numbers alone so amount columns stay numeric", () => {
    expect(toCsv(["A"], [["-40.00"]])).toBe("A\r\n-40.00");
    expect(toCsv(["A"], [["+2000"]])).toBe("A\r\n+2000");
    expect(toCsv(["A"], [[-40]])).toBe("A\r\n-40");
    expect(toCsv(["A"], [["0.5"]])).toBe("A\r\n0.5");
  });
});

