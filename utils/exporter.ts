export interface ExportRow {
  [key: string]: string | number;
}

export interface ExportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

// ─── EXCEL ────────────────────────────────────────────────────────────────────

export async function generateExcel(table: ExportTable, filename = "relatorio-kronos.xlsx") {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();
  const sheetData = [table.headers, ...table.rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  const colWidths = table.headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...table.rows.map((r) => String(r[i] ?? "").length)
    );
    return { wch: Math.min(maxLen + 4, 50) };
  });
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, table.title.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function generatePDF(
  title: string,
  subtitle: string,
  table: ExportTable,
  filename = "relatorio-kronos.pdf"
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(240, 240, 240);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("KRONOS AI", margin, 12);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 160);
  doc.text("Relatório gerado automaticamente", margin, 18);

  const dateStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  doc.text(dateStr, pageW - margin, 18, { align: "right" });

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, 40);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    const lines = doc.splitTextToSize(subtitle, pageW - margin * 2) as string[];
    doc.text(lines, margin, 47);
  }

  autoTable(doc, {
    startY: subtitle ? 58 : 48,
    head: [table.headers],
    body: table.rows.map((r) => r.map(String)),
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [20, 20, 20], textColor: [240, 240, 240], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { cellPadding: 3, lineColor: [210, 210, 210], lineWidth: 0.2 },
    didDrawPage: (data) => {
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `Kronos AI  ·  Página ${data.pageNumber} de ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" }
      );
    },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
