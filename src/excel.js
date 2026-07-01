import ExcelJS from 'exceljs';

const rawSlots = [
  { col: 'B', titleEnd: 'D' },
  { col: 'F', titleEnd: 'H' }
];

const finalSlots = [
  { col: 'K', titleEnd: 'M' },
  { col: 'O', titleEnd: 'Q' },
  { col: 'S', titleEnd: 'U' },
  { col: 'W', titleEnd: 'Y' }
];

export async function buildReservationWorkbook(reservation) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'materiales-ot';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('RPS', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }],
    properties: { showGridLines: false }
  });

  configureColumns(sheet, reservation.ofs.length);
  paintTitle(sheet, reservation.orderCode);

  const groupedByOf = groupFinalRows(reservation.ofs);
  reservation.ofs.forEach((ofBlock, index) => {
    addRawTable(sheet, ofBlock, index);
    addFinalTable(sheet, ofBlock, groupedByOf.get(ofBlock.of) || [], index);
  });

  addOfTable(sheet, reservation.ofs);
  addNotes(sheet, reservation);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function configureColumns(sheet, ofCount) {
  const widths = {
    A: 3,
    B: 12,
    C: 20,
    D: 12,
    E: 3,
    F: 12,
    G: 20,
    H: 12,
    I: 3,
    J: 3,
    K: 12,
    L: 20,
    M: 12,
    N: 3,
    O: 12,
    P: 20,
    Q: 12,
    R: 3,
    S: 12,
    T: 20,
    U: 12,
    V: 3,
    W: 12,
    X: 20,
    Y: 12,
    Z: 3,
    AA: 10
  };

  for (let i = 1; i <= Math.max(31 + ofCount, 31); i += 1) {
    const letter = sheet.getColumn(i).letter;
    sheet.getColumn(i).width = widths[letter] || 12;
  }
}

function paintTitle(sheet, orderCode) {
  sheet.mergeCells('A1:B1');
  const title = sheet.getCell('A1');
  title.value = 'RPS';
  title.font = { bold: true, size: 16, color: { argb: 'FF102A43' } };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 24;

  if (orderCode) {
    sheet.getCell('D1').value = 'PEDIDO';
    sheet.getCell('E1').value = orderCode;
    sheet.getCell('D1').font = { bold: true, color: { argb: 'FF102A43' } };
  }
}

function addRawTable(sheet, ofBlock, index) {
  const slot = rawSlots[index % rawSlots.length];
  const band = Math.floor(index / rawSlots.length);
  const row = 5 + band * 30;
  const titleRow = row - 2;
  const number = pad2(index + 1);

  mergeTitle(sheet, `${slot.col}${titleRow}:${slot.titleEnd}${titleRow}`, `ESTRUCTURA ${number}`);
  addTable(sheet, {
    name: `MATE_ES${number}`,
    ref: `${slot.col}${row}`,
    columns: ['OF', 'ARTICULO', 'CANTIDAD'],
    rows: ofBlock.materials.map((line) => [numericOf(ofBlock.of), line.code, line.quantity])
  });
}

function addFinalTable(sheet, ofBlock, rows, index) {
  const slot = finalSlots[index % finalSlots.length];
  const band = Math.floor(index / finalSlots.length);
  const row = 5 + band * 30;
  const titleRow = row - 2;
  const number = pad2(index + 1);

  mergeTitle(sheet, `${slot.col}${titleRow}:${slot.titleEnd}${titleRow}`, `RPS ESTR. ${number}`);
  addTable(sheet, {
    name: `Anexar${index + 1}`,
    ref: `${slot.col}${row}`,
    columns: ['OF', 'ARTICULO', 'CANTIDAD'],
    rows: rows.map((line) => [formatRpsOf(ofBlock.of), line.code, line.quantity])
  });
}

function addOfTable(sheet, ofs) {
  const columns = ['ESTR.', ...ofs.map((_, index) => `ES${pad2(index + 1)}`)];
  const rows = [['OF', ...ofs.map((ofBlock) => numericOf(ofBlock.of))]];

  addTable(sheet, {
    name: 'OF_ESTR',
    ref: 'AA5',
    columns,
    rows
  });
}

function addNotes(sheet, reservation) {
  const firstFreeBand = Math.ceil(reservation.ofs.length / 2);
  const row = Math.max(65, 5 + firstFreeBand * 30);
  sheet.mergeCells(`B${row}:H${row}`);
  const cell = sheet.getCell(`B${row}`);
  cell.value = 'Generado desde la web app de reservas de materiales.';
  cell.font = { italic: true, color: { argb: 'FF486581' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  cell.border = border('FFD9E2EC');
}

function addTable(sheet, { name, ref, columns, rows }) {
  sheet.addTable({
    name,
    ref,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium4',
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false
    },
    columns: columns.map((column) => ({ name: column })),
    rows
  });

  const start = decodeCell(ref);
  const endCol = start.col + columns.length - 1;
  const endRow = start.row + Math.max(rows.length, 1);
  styleTableRange(sheet, start.row, start.col, endRow, endCol);
}

function styleTableRange(sheet, startRow, startCol, endRow, endCol) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.alignment = {
        vertical: 'middle',
        horizontal: col === startCol + 1 ? 'left' : 'center'
      };
      cell.border = border('FFD9E2EC');
      if (row === startRow) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B7285' } };
      }
    }
  }
}

function mergeTitle(sheet, range, text) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = text;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.font = { bold: true, color: { argb: 'FF102A43' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBFF' } };
  cell.border = border('FFBCCCDC');
}

function groupFinalRows(ofs) {
  const byOf = new Map();

  for (const ofBlock of ofs) {
    const grouped = byOf.get(ofBlock.of) || new Map();
    for (const line of ofBlock.materials) {
      const current = grouped.get(line.code) || { code: line.code, quantity: 0 };
      current.quantity = roundQuantity(current.quantity + line.quantity);
      grouped.set(line.code, current);
    }
    byOf.set(ofBlock.of, grouped);
  }

  return new Map(
    Array.from(byOf.entries()).map(([of, lines]) => [
      of,
      Array.from(lines.values()).sort((a, b) => a.code.localeCompare(b.code, 'es'))
    ])
  );
}

function border(color) {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } }
  };
}

function decodeCell(ref) {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!match) throw new Error(`Referencia de celda no valida: ${ref}`);

  const letters = match[1].toUpperCase();
  let col = 0;
  for (const letter of letters) {
    col = col * 26 + (letter.charCodeAt(0) - 64);
  }

  return { col, row: Number(match[2]) };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function numericOf(value) {
  const numeric = Number(String(value).trim());
  return Number.isFinite(numeric) ? numeric : String(value).trim();
}

function formatRpsOf(value) {
  const numeric = numericOf(value);
  return `0${numeric}`;
}

function roundQuantity(value) {
  return Math.round(value * 1000000) / 1000000;
}
