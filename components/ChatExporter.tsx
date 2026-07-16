"use client";

import { useState } from "react";
import { Download, Sheet, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { generateExcel, generatePDF, ExportTable } from "@/utils/exporter";

interface ChatExporterProps {
  table: ExportTable;
  subtitle?: string;
}

export default function ChatExporter({ table, subtitle = "" }: ChatExporterProps) {
  const [open, setOpen]       = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const filename = table.title.toLowerCase().replace(/\s+/g, "-");

  const handleExcel = () => generateExcel(table, `${filename}.xlsx`);

  const handlePDF = async () => {
    setLoadingPdf(true);
    try { await generatePDF(table.title, subtitle, table, `${filename}.pdf`); }
    finally { setLoadingPdf(false); }
  };

  return (
    <div className="mt-3 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30">

      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Sheet strokeWidth={1.5} className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">{table.title}</span>
          <span className="text-[10px] text-zinc-600">{table.rows.length} linha{table.rows.length !== 1 ? "s" : ""}</span>
        </div>
        {open
          ? <ChevronUp   strokeWidth={1.5} className="w-3.5 h-3.5 text-zinc-600" />
          : <ChevronDown strokeWidth={1.5} className="w-3.5 h-3.5 text-zinc-600" />
        }
      </button>

      {/* Table */}
      {open && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-900">
                {table.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-zinc-500 font-medium border-b border-zinc-800 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-zinc-300 border-b border-zinc-900/50 whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/20">
        <Download strokeWidth={1.5} className="w-3.5 h-3.5 text-zinc-600" />
        <span className="text-[10px] text-zinc-600 mr-1">Exportar</span>

        <button onClick={handleExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-900 bg-emerald-950/40 text-emerald-400 text-[11px] font-medium hover:bg-emerald-900/40 transition-colors">
          <Sheet strokeWidth={1.5} className="w-3.5 h-3.5" />
          Excel
        </button>

        <button onClick={handlePDF} disabled={loadingPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-900 bg-red-950/40 text-red-400 text-[11px] font-medium hover:bg-red-900/40 transition-colors disabled:opacity-40">
          <FileText strokeWidth={1.5} className="w-3.5 h-3.5" />
          {loadingPdf ? "Gerando..." : "PDF"}
        </button>
      </div>
    </div>
  );
}
