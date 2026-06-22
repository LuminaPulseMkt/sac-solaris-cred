import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReportConversation {
  id: string;
  operatorName: string;
  leadName: string;
  startedAt: string;
  totalMessages: number;
  avgResponseTimeS: number | null;
  scoreSac: number | null;
  scoreAi: number | null;
  status: string;
  converted: boolean;
}

export interface ReportAnalysisSummary {
  averageScore: number;
  sentimentCounts: { positive: number; neutral: number; negative: number };
  topTopics: Array<{ topic: string; count: number }>;
  topImprovements: Array<{ text: string; count: number }>;
}

export interface ReportMetrics {
  total: number;
  avgScore: number;
  avgResponseTime: number;
  conversionRate: number;
}

export interface GeneratePdfParams {
  period: string;
  operatorFilter: string;
  metrics: ReportMetrics;
  ranking: Array<{ operator: string; conversations: number; avgScore: number; avgRespS: number; convRate: number }>;
  conversations: ReportConversation[];
  aiSummary: ReportAnalysisSummary | null;
  includeAi: boolean;
  includeTable: boolean;
}

function fmtDuration(s: number): string {
  if (!s || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return m > 0 ? `${m}m ${rest}s` : `${rest}s`;
}

export function generateReportPdf(params: GeneratePdfParams): { blob: Blob; base64: string; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const now = new Date();
  const stamp = now.toLocaleString("pt-BR");

  // Capa
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 220, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Solaris Analytics Chat", 40, 90);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("SAC — Relatório de Qualidade de Atendimento", 40, 120);
  doc.setFontSize(11);
  doc.text(`Período: ${params.period}`, 40, 160);
  doc.text(`Operador: ${params.operatorFilter}`, 40, 178);
  doc.text(`Gerado em: ${stamp}`, 40, 196);

  // Página 2 — Resumo executivo
  doc.addPage();
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Resumo executivo", 40, 60);

  const m = params.metrics;
  const cards = [
    { label: "Conversas", value: String(m.total) },
    { label: "Score médio SAC", value: `${m.avgScore}/100` },
    { label: "Tempo médio resposta", value: fmtDuration(m.avgResponseTime) },
    { label: "Taxa de conversão", value: `${m.conversionRate.toFixed(1)}%` },
  ];
  let cx = 40;
  cards.forEach((c) => {
    doc.setDrawColor(220);
    doc.roundedRect(cx, 80, 120, 70, 6, 6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(c.label, cx + 10, 100);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(c.value, cx + 10, 130);
    cx += 130;
  });

  autoTable(doc, {
    startY: 180,
    head: [["Operador", "Conversas", "Score médio", "Tempo médio", "Conversão"]],
    body: params.ranking.map((r) => [
      r.operator,
      String(r.conversations),
      `${r.avgScore}/100`,
      fmtDuration(r.avgRespS),
      `${r.convRate.toFixed(1)}%`,
    ]),
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 9 },
  });

  // Página IA
  if (params.includeAi && params.aiSummary) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Análise de IA", 40, 60);

    const ai = params.aiSummary;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Score médio de qualidade (IA): ${ai.averageScore}/100`, 40, 90);
    doc.text(
      `Sentimentos — positivo: ${ai.sentimentCounts.positive} · neutro: ${ai.sentimentCounts.neutral} · negativo: ${ai.sentimentCounts.negative}`,
      40,
      110,
    );

    autoTable(doc, {
      startY: 140,
      head: [["Top tópicos", "Ocorrências"]],
      body: ai.topTopics.map((t) => [t.topic, String(t.count)]),
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      head: [["Top sugestões de melhoria", "Frequência"]],
      body: ai.topImprovements.map((t) => [t.text, String(t.count)]),
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9 },
    });
  }

  // Tabela de conversas
  if (params.includeTable && params.conversations.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Conversas", 40, 60);

    autoTable(doc, {
      startY: 80,
      head: [["Operador", "Lead", "Data", "Msgs", "Tempo resp.", "SAC", "IA", "Status", "Conv?"]],
      body: params.conversations.map((c) => [
        c.operatorName,
        c.leadName,
        new Date(c.startedAt).toLocaleString("pt-BR"),
        String(c.totalMessages),
        c.avgResponseTimeS ? fmtDuration(c.avgResponseTimeS) : "—",
        c.scoreSac != null ? String(c.scoreSac) : "—",
        c.scoreAi != null ? String(c.scoreAi) : "—",
        c.status,
        c.converted ? "Sim" : "Não",
      ]),
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8 },
    });
  }

  const blob = doc.output("blob");
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  const filename = `sac-relatorio-${now.toISOString().slice(0, 10)}.pdf`;
  return { blob, base64, filename };
}
