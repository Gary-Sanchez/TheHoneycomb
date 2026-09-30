import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as xlsx from "xlsx";
import { extractTextFromFile, htmlToText, parseAttendance, parseCsvAttendance } from "./parser";

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

// Synthetic OLE .doc: the body lives in the "WordDocument" stream, while style names and document
// properties sit in other streams — the same layout that made the old whole-file scan report
// "Table Grid" or the author as attendees. (Not produced by Word; see the PR notes on .doc.)
function makeOleDoc(body: string, otherStreams: Record<string, string>): Buffer {
  const cfb = xlsx.CFB.utils.cfb_new();
  const header = Buffer.alloc(64, 0x01); // binary FIB-ish prefix: no printable runs
  xlsx.CFB.utils.cfb_add(cfb, "/WordDocument", Buffer.concat([header, Buffer.from(body, "latin1")]));
  for (const [name, text] of Object.entries(otherStreams)) {
    xlsx.CFB.utils.cfb_add(cfb, `/${name}`, Buffer.from(text, "latin1"));
  }
  return xlsx.CFB.write(cfb, { type: "buffer" }) as Buffer;
}

describe(".doc extraction", () => {
  it("reads only the WordDocument stream, ignoring style names and document properties", async () => {
    const buf = makeOleDoc("Elena Rostova\x07Present\x07\x07\rCarlos Gomez\x07Absent\x07\x07\r", {
      "1Table": "\0Table Grid\0Balloon Text\0Placeholder Text\0",
      "\x05SummaryInformation": "\0Gary Doe\0Acme Corporation\0",
    });
    const text = await extractTextFromFile(buf, ".doc");
    expect(text).not.toMatch(/Table Grid|Balloon Text|Placeholder|Gary Doe|Acme/);
    const rec = byName(parseAttendance(text, "Music Room"));
    expect(Object.keys(rec).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
    expect(rec["Carlos Gomez"].status).toBe("absent");
    expect(rec["Elena Rostova"].status).toBe("present");
  });

  it("falls back to scanning the whole buffer when it is not an OLE container", async () => {
    const text = await extractTextFromFile(Buffer.from("\x00\x01Elena Rostova\r\nCarlos Gomez\r\n\x00", "latin1"), ".doc");
    expect(parseAttendance(text, "Music Room").map(r => r.name).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
  });
});

describe("ambiguous numeric dates", () => {
  it("reads 12/6/26 as June 12 when the document has Spanish labels (day-first)", () => {
    const text = "Hora de inicio: 12/6/26, 12:30:00\nElena Rostova\n";
    expect(parseAttendance(text, "Speakeasy")[0].date).toBe("2026-06-12");
  });

  it("applies day-first to a Fecha column too", () => {
    const text = "Fecha,Nombre,Estado\n03/06/2026,Elena Rostova,Presente\n";
    expect(parseAttendance(text, "Speakeasy")[0].date).toBe("2026-06-03");
  });

  it("keeps month-first for English documents", () => {
    const text = "Start time: 12/6/26, 12:30:00 PM\nElena Rostova\n";
    expect(parseAttendance(text, "Speakeasy")[0].date).toBe("2026-12-06");
  });

  it("lets a part greater than 12 decide regardless of locale", () => {
    expect(parseAttendance("Hora de inicio: 25/6/26\nElena Rostova\n", "Speakeasy")[0].date).toBe("2026-06-25");
    expect(parseAttendance("Start time: 6/25/26\nElena Rostova\n", "Speakeasy")[0].date).toBe("2026-06-25");
  });
});

describe("parseCsvAttendance (US-18 .csv path)", () => {
  const csvByName = (records: ReturnType<typeof parseCsvAttendance>["records"]) =>
    Object.fromEntries(records.map(r => [r.name, r]));

  it("takes the session date from the Teams Start time row and Title Cases names", () => {
    const csv = [
      "Meeting title,Speakeasy weekly",
      'Start time,"6/12/26, 12:30:00 PM"',
      "",
      "Name,Email,Role",
      "PEDRO ALVAREZ,p@x.com,Attendee",
      "mIgUeL sAnChEz (Guest),m@x.com,Attendee",
    ].join("\n");
    const first = parseCsvAttendance(Buffer.from(csv, "utf-8"), "Speakeasy");
    expect(first.dateDetected).toBe(true);
    expect(first.records.map(r => [r.name, r.date])).toEqual([
      ["Pedro Alvarez", "2026-06-12"],
      ["Miguel Sanchez", "2026-06-12"],
    ]);
    // Deterministic: the same file always yields the same result
    expect(parseCsvAttendance(Buffer.from(csv, "utf-8"), "Speakeasy")).toEqual(first);
  });

  it("reports dateDetected=false with empty dates instead of defaulting to the reference date", () => {
    const csv = "Start time,not a date\nName\nElena Rostova\n";
    const { records, dateDetected } = parseCsvAttendance(Buffer.from(csv, "utf-8"), "Speakeasy");
    expect(dateDetected).toBe(false);
    expect(records).toEqual([{ name: "Elena Rostova", activity: "Speakeasy", date: "", status: "present" }]);
  });

  it("maps a Date,Name,Activity,Status header (date, activity and absent status kept)", () => {
    const csv = [
      "Date,Name,Activity,Status",
      "2026-06-10,Elena Rostova,Reading Club,Present",
      "2026-06-10,Carlos Gomez,Reading Club,Absent",
    ].join("\n");
    const rec = csvByName(parseCsvAttendance(Buffer.from(csv, "utf-8")).records);
    expect(Object.keys(rec).sort()).toEqual(["Carlos Gomez", "Elena Rostova"]);
    expect(rec["Elena Rostova"]).toMatchObject({ date: "2026-06-10", activity: "Reading Club", status: "present" });
    expect(rec["Carlos Gomez"]).toMatchObject({ date: "2026-06-10", activity: "Reading Club", status: "absent" });
  });

  it("lets the activity chosen for the upload win over the Activity column", () => {
    const csv = "Date,Name,Activity\n2026-06-10,Elena Rostova,Reading Club\n";
    expect(parseCsvAttendance(Buffer.from(csv, "utf-8"), "Music Room").records[0].activity).toBe("Music Room");
  });

  it("splits ';' CSVs and keeps accents from latin1 files", () => {
    const csv = "Fecha;Nombre;Estado\n10/06/2026;José Núñez;Presente\n10/06/2026;María Pérez;Ausente\n";
    const rec = csvByName(parseCsvAttendance(Buffer.from(csv, "latin1"), "Reading Club").records);
    expect(rec["José Núñez"]?.status).toBe("present");
    expect(rec["María Pérez"]?.status).toBe("absent");
  });

  it("decodes UTF-16LE Teams exports", () => {
    const csv = "Name\tRole\r\nElena Rostova\tAttendee\r\n";
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, "utf16le")]);
    expect(parseCsvAttendance(buf, "Speakeasy").records.map(r => r.name)).toEqual(["Elena Rostova"]);
  });

  it("flags an empty file", () => {
    expect(parseCsvAttendance(Buffer.from("  \n", "utf-8")).isEmpty).toBe(true);
  });
});
