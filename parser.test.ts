import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as xlsx from "xlsx";
import { extractTextFromFile, htmlToText, parseAttendance } from "./parser";

const byName = (records: ReturnType<typeof parseAttendance>) =>
  Object.fromEntries(records.map(r => [r.name, r]));

// Minimal .docx with a single table (rows of cells), enough for mammoth to read.
async function makeDocxTable(rows: string[][]): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const tbl = rows
    .map(r => `<w:tr>${r.map(c => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`)
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>${tbl}</w:tbl></w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function makeWorkbook(rows: string[][], bookType: "xlsx" | "biff8"): Buffer {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), "Log");
  return xlsx.write(wb, { type: "buffer", bookType }) as Buffer;
}

describe("parseAttendance — text shapes", () => {
  it("reads a Teams export: Start time wins, titles stripped, hosts and metadata dropped", () => {
    const text = [
      "Meeting Summary",
      "Meeting title\tMusic Room",
      "Start time\t6/12/26, 12:30:00 PM",
      "End time\t6/12/26, 1:30:00 PM",
      "Attended participants\t3",
      "Name\tFirst Join\tLast Leave\tIn-meeting Duration\tEmail\tRole",
      "Elena Rostova\t6/12/26, 12:31:00 PM\t6/12/26, 1:29:00 PM\t58m\telena@example.com\tAttendee",
      "Dr. Carlos Gomez\t6/12/26, 12:35:00 PM\t6/12/26, 1:20:00 PM\t45m\tcarlos@example.com\tAttendee",
      "Rodrigo Rivero\t6/12/26, 12:30:00 PM\t6/12/26, 1:30:00 PM\t1h\trodrigo@example.com\tOrganizer",
    ].join("\n");

    const records = parseAttendance(text, "Music Room");
    expect(records.map(r => r.name).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
    for (const r of records) {
      expect(r).toMatchObject({ date: "2026-06-12", activity: "Music Room", status: "present" });
    }
  });

  it("splits '; ' CSVs and keeps accents from latin1 files", async () => {
    const csv = "Nombre;Estado\nJosé Núñez;Presente\nMaría Pérez;Ausente\n";
    const text = await extractTextFromFile(Buffer.from(csv, "latin1"), ".csv");
    const rec = byName(parseAttendance(text, "Reading Club"));
    expect(rec["José Núñez"]?.status).toBe("present");
    expect(rec["María Pérez"]?.status).toBe("absent");
  });

  it("keeps the present row when a name is listed as absent and present", () => {
    const text = "Date: June 15, 2026\nElena Rostova (Present)\nCarlos Gomez (Absent)\nCarlos Gomez (Present)\n";
    const rec = byName(parseAttendance(text, "Music Room"));
    expect(Object.keys(rec).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
    expect(rec["Carlos Gomez"].status).toBe("present");
    expect(rec["Carlos Gomez"].date).toBe("2026-06-15");
  });

  it("drops configured hosts and never lets metadata lines through as names", () => {
    const text = "Meeting title\nSpeakeasy Attendance\nAttended participants\nElena Rostova\nNicolas Rios\nWara Hermosa\n";
    expect(parseAttendance(text, "Speakeasy").map(r => r.name)).toEqual(["Elena Rostova"]);
  });

  it("falls back to the 2026-06-24 reference date when the file has none", () => {
    const [rec] = parseAttendance("Elena Rostova\n", "Speakeasy");
    expect(rec.date).toBe("2026-06-24");
  });

  it("applies a document-wide Start time over per-row dates", () => {
    const text = "Start time: 6/12/26, 12:30:00 PM\nElena Rostova - Music Room - 2026-05-01 - Present\n";
    expect(parseAttendance(text)[0].date).toBe("2026-06-12");
  });
});

describe("parseAttendance — header rows", () => {
  it("maps columns when the header starts with Date (CSV)", () => {
    const text = [
      "Date,Name,Activity,Status",
      "2026-06-10,Elena Rostova,Reading Club,Present",
      "2026-06-10,Carlos Gomez,Reading Club,Absent",
    ].join("\n");
    const rec = byName(parseAttendance(text));
    expect(Object.keys(rec).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
    expect(rec["Elena Rostova"]).toMatchObject({ date: "2026-06-10", activity: "Reading Club", status: "present" });
    expect(rec["Carlos Gomez"]).toMatchObject({ date: "2026-06-10", activity: "Reading Club", status: "absent" });
  });

  it.each([["xlsx" as const, ".xlsx"], ["biff8" as const, ".xls"]])(
    "maps Fecha | Nombre | Estado columns from a spreadsheet (%s)",
    async (bookType, ext) => {
      const buf = makeWorkbook(
        [
          ["Fecha", "Nombre", "Estado"],
          ["2026-06-10", "Elena Rostova", "Presente"],
          ["2026-06-10", "Carlos Gomez", "Ausente"],
        ],
        bookType
      );
      const rec = byName(parseAttendance(await extractTextFromFile(buf, ext), "Reading Club"));
      expect(Object.keys(rec).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
      expect(rec["Carlos Gomez"]).toMatchObject({ date: "2026-06-10", status: "absent" });
      expect(rec["Elena Rostova"].status).toBe("present");
    }
  );

  it("still skips 'Start time<TAB>…' pairs as metadata, not as a header", () => {
    const text = "Start time\t6/12/26, 12:30:00 PM\nElena Rostova\n";
    expect(parseAttendance(text, "Speakeasy").map(r => r.name)).toEqual(["Elena Rostova"]);
  });
});

describe("docx tables", () => {
  it("keeps the Status column with its row (Absent must not become Present)", async () => {
    const buf = await makeDocxTable([
      ["Name", "Status"],
      ["Elena Rostova", "Present"],
      ["Carlos Gomez", "Absent"],
    ]);
    const rec = byName(parseAttendance(await extractTextFromFile(buf, ".docx"), "Music Room"));
    expect(Object.keys(rec).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
    expect(rec["Carlos Gomez"].status).toBe("absent");
    expect(rec["Elena Rostova"].status).toBe("present");
  });

  it("uses a lone status line that follows a bare name, even without table structure", () => {
    const rec = byName(parseAttendance("Elena Rostova\n\nPresent\n\nCarlos Gomez\n\nAbsent\n", "Music Room"));
    expect(rec["Carlos Gomez"].status).toBe("absent");
    expect(rec["Elena Rostova"].status).toBe("present");
  });
});

describe("htmlToText", () => {
  it("turns each table row into one tab-separated line and each paragraph into a line", () => {
    const html =
      "<p>Music Room</p><table><tr><td><p>Name</p></td><td><p>Status</p></td></tr>" +
      "<tr><td><p>Carlos</p><p>Gomez</p></td><td><p>Absent</p></td></tr></table><p>Thanks &amp; see you</p>";
    expect(htmlToText(html)).toBe("Music Room\nName\tStatus\nCarlos Gomez\tAbsent\nThanks & see you");
  });

  it("keeps empty cells so later columns stay aligned", () => {
    expect(htmlToText("<table><tr><td>Elena Rostova</td><td></td><td>Present</td></tr></table>")).toBe(
      "Elena Rostova\t\tPresent"
    );
  });
});
