import * as XLSX from "xlsx";

export interface ParsedSeat {
  name: string | null;
  element_type: "aron_kodesh" | "bima" | "amud" | "chatan" | null;
}

export interface ParsedRow {
  seats: ParsedSeat[];
}

export interface ParsedSection {
  name: string;
  rows: ParsedRow[];
}

const STRUCTURAL_ELEMENTS: Record<string, ParsedSeat["element_type"]> = {
  "ארון קודש": "aron_kodesh",
  "בימה": "bima",
  "עמוד": "amud",
  "חתן": "chatan",
};

function isStructuralElement(value: string): ParsedSeat["element_type"] | null {
  const trimmed = value.trim();
  for (const [key, type] of Object.entries(STRUCTURAL_ELEMENTS)) {
    if (trimmed === key) return type;
  }
  return null;
}

/**
 * Parse the Excel file and extract the seating map from the first sheet that
 * contains "טור" headers. The map is structured as columns (טורים) side-by-side.
 */
export function parseSeatingExcel(file: ArrayBuffer): ParsedSection[] {
  const workbook = XLSX.read(file, { type: "array" });

  // Try each sheet to find the one with "טור" headers
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data: (string | null)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: true,
    });

    if (!data.length) continue;

    // Find the header row with "טור" columns
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i];
      if (row?.some((cell) => cell && String(cell).includes("טור"))) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) continue;

    // Identify column boundaries for each "טור"
    const headerRow = data[headerRowIdx];
    const sectionBounds: { name: string; startCol: number; endCol: number }[] = [];

    for (let c = 0; c < headerRow.length; c++) {
      const cell = headerRow[c];
      if (cell && String(cell).includes("טור")) {
        sectionBounds.push({
          name: String(cell).trim(),
          startCol: c,
          endCol: c,
        });
      }
    }

    // Determine end columns - each section ends where the next starts
    for (let i = 0; i < sectionBounds.length; i++) {
      if (i + 1 < sectionBounds.length) {
        sectionBounds[i].endCol = sectionBounds[i + 1].startCol - 1;
      } else {
        sectionBounds[i].endCol = headerRow.length - 1;
      }
    }

    // Extract data rows (skip header and empty rows after header)
    const dataRows = data.slice(headerRowIdx + 1);

    // Build sections
    const sections: ParsedSection[] = [];

    for (const bound of sectionBounds) {
      const rows: ParsedRow[] = [];

      for (const dataRow of dataRows) {
        if (!dataRow) continue;

        const seats: ParsedSeat[] = [];
        let hasContent = false;

        for (let c = bound.startCol; c <= bound.endCol; c++) {
          const cellValue = dataRow[c];
          if (cellValue === null || cellValue === undefined || String(cellValue).trim() === "") {
            seats.push({ name: null, element_type: null });
          } else {
            const strVal = String(cellValue).trim();
            const elemType = isStructuralElement(strVal);
            if (elemType) {
              seats.push({ name: null, element_type: elemType });
              hasContent = true;
            } else {
              seats.push({ name: strVal, element_type: null });
              hasContent = true;
            }
          }
        }

        // Only add row if it has some content
        if (hasContent) {
          rows.push({ seats });
        }
      }

      if (rows.length > 0) {
        sections.push({ name: bound.name, rows });
      }
    }

    if (sections.length > 0) return sections;
  }

  return [];
}
