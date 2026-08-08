// ---------------------------------------------------------------------
// Pay calculation (shared by overview + preview + run)
// gross  = base_salary + bonus
// tax    = gross * tax_rate%
// pension= gross * pension_rate%
// net    = gross - tax - pension - hmo - other_deductions
// ---------------------------------------------------------------------
function calcPayslip(emp) {
  const base = Number(emp.base_salary || 0);
  const bonus = Number(emp.bonus || 0);
  const gross = base + bonus;
  const tax = gross * (Number(emp.tax_rate || 0) / 100);
  const pension = gross * (Number(emp.pension_rate || 0) / 100);
  const hmo = Number(emp.hmo_deduction || 0);
  const other = Number(emp.other_deductions || 0);
  const net = gross - tax - pension - hmo - other;
  return { base, bonus, gross, tax, pension, hmo, other, net };
}

// An employee is eligible for pay period P ("YYYY-MM") if:
//   - their hire month is on or before P (they'd started by then), and
//   - they have no exit date, OR their exit month is on or after P
//     (they're still paid for their final month, then excluded after).
// This is what makes onboarding/offboarding automatic — no manual
// active/inactive toggling needed each run.
function isEligibleForPeriod(emp, period) {
  const hireMonth = (emp.hire_date || "9999-99").slice(0, 7);
  if (hireMonth > period) return false;
  if (emp.exit_date) {
    const exitMonth = emp.exit_date.slice(0, 7);
    if (exitMonth < period) return false;
  }
  return true;
}

function initPayPeriodDefault() {
  const input = document.getElementById("pay-period");
  const now = new Date();
  input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Payroll overview — a live table of every active employee's current
// breakdown, independent of any specific run. Re-rendered whenever
// employees are (re)loaded, so it's always up to date.
// ---------------------------------------------------------------------
function renderPayrollOverview() {
  const tbody = document.getElementById("overview-tbody");
  const tfoot = document.getElementById("overview-tfoot");
  if (!tbody) return;

  const staff = employeesForCurrentCompany().filter((e) => !isArchived(e));

  if (!staff.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-row">No active staff yet — add employees first.</td></tr>`;
    tfoot.hidden = true;
    return;
  }

  const rows = staff.map((e) => ({ emp: e, calc: calcPayslip(e) }));

  tbody.innerHTML = rows.map(({ emp, calc }) => `
    <tr>
      <td>${escapeHtml(emp.full_name)}</td>
      <td>${escapeHtml(emp.position || "—")}</td>
      <td class="num">${formatMoney(calc.base)}</td>
      <td class="num">${formatMoney(calc.bonus)}</td>
      <td class="num">${formatMoney(calc.gross)}</td>
      <td class="num">${formatMoney(calc.tax)}</td>
      <td class="num">${formatMoney(calc.pension)}</td>
      <td class="num">${formatMoney(calc.hmo)}</td>
      <td class="num">${formatMoney(calc.other)}</td>
      <td class="num">${formatMoney(calc.net)}</td>
    </tr>
  `).join("");

  const totals = rows.reduce((acc, { calc }) => ({
    gross: acc.gross + calc.gross,
    tax: acc.tax + calc.tax,
    pension: acc.pension + calc.pension,
    hmo: acc.hmo + calc.hmo,
    other: acc.other + calc.other,
    net: acc.net + calc.net,
  }), { gross: 0, tax: 0, pension: 0, hmo: 0, other: 0, net: 0 });

  document.getElementById("overview-total-gross").textContent = formatMoney(totals.gross);
  document.getElementById("overview-total-tax").textContent = formatMoney(totals.tax);
  document.getElementById("overview-total-pension").textContent = formatMoney(totals.pension);
  document.getElementById("overview-total-hmo").textContent = formatMoney(totals.hmo);
  document.getElementById("overview-total-other").textContent = formatMoney(totals.other);
  document.getElementById("overview-total-net").textContent = formatMoney(totals.net);
  tfoot.hidden = false;
}

// ---------------------------------------------------------------------
// Run payroll — preview + commit
// ---------------------------------------------------------------------
let currentPreview = null;

function clearPreview() {
  currentPreview = null;
  const tbody = document.getElementById("preview-tbody");
  const tfoot = document.getElementById("preview-tfoot");
  const runBtn = document.getElementById("run-btn");
  const statusEl = document.getElementById("run-status");
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Choose a period and click Preview.</td></tr>`;
  if (tfoot) tfoot.hidden = true;
  if (runBtn) runBtn.disabled = true;
  if (statusEl) statusEl.hidden = true;
}

document.getElementById("preview-btn").addEventListener("click", () => {
  const period = document.getElementById("pay-period").value;
  const tbody = document.getElementById("preview-tbody");
  const tfoot = document.getElementById("preview-tfoot");
  const runBtn = document.getElementById("run-btn");
  const statusEl = document.getElementById("run-status");
  statusEl.hidden = true;

  if (!period) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Choose a period first.</td></tr>`;
    tfoot.hidden = true;
    runBtn.disabled = true;
    return;
  }

  const eligible = employeesForCurrentCompany().filter((e) => isEligibleForPeriod(e, period));
  if (!eligible.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No employees are eligible for pay in ${escapeHtml(period)} for this company (check hire/exit dates).</td></tr>`;
    tfoot.hidden = true;
    runBtn.disabled = true;
    return;
  }

  const rows = eligible.map((e) => ({ emp: e, calc: calcPayslip(e) }));
  currentPreview = { period, rows };

  tbody.innerHTML = rows.map(({ emp, calc }) => `
    <tr>
      <td>${escapeHtml(emp.full_name)}</td>
      <td class="num">${formatMoney(calc.gross)}</td>
      <td class="num">${formatMoney(calc.tax)}</td>
      <td class="num">${formatMoney(calc.pension)}</td>
      <td class="num">${formatMoney(calc.hmo)}</td>
      <td class="num">${formatMoney(calc.other)}</td>
      <td class="num">${formatMoney(calc.net)}</td>
    </tr>
  `).join("");

  const totals = rows.reduce((acc, { calc }) => ({
    gross: acc.gross + calc.gross,
    tax: acc.tax + calc.tax,
    pension: acc.pension + calc.pension,
    hmo: acc.hmo + calc.hmo,
    other: acc.other + calc.other,
    net: acc.net + calc.net,
  }), { gross: 0, tax: 0, pension: 0, hmo: 0, other: 0, net: 0 });

  document.getElementById("preview-total-gross").textContent = formatMoney(totals.gross);
  document.getElementById("preview-total-tax").textContent = formatMoney(totals.tax);
  document.getElementById("preview-total-pension").textContent = formatMoney(totals.pension);
  document.getElementById("preview-total-hmo").textContent = formatMoney(totals.hmo);
  document.getElementById("preview-total-other").textContent = formatMoney(totals.other);
  document.getElementById("preview-total-net").textContent = formatMoney(totals.net);
  tfoot.hidden = false;
  runBtn.disabled = false;
});

document.getElementById("run-btn").addEventListener("click", async () => {
  if (!currentPreview) return;
  const runBtn = document.getElementById("run-btn");
  const statusEl = document.getElementById("run-status");
  runBtn.disabled = true;
  runBtn.textContent = "Running…";

  const { period, rows } = currentPreview;
  const totals = rows.reduce((acc, { calc }) => ({
    gross: acc.gross + calc.gross,
    net: acc.net + calc.net,
  }), { gross: 0, net: 0 });

  const { data: run, error: runError } = await sb
    .from("payroll_runs")
    .insert({
      company: currentCompany,
      period,
      total_gross: totals.gross,
      total_net: totals.net,
      employee_count: rows.length,
    })
    .select()
    .single();

  if (runError) {
    statusEl.hidden = false;
    statusEl.className = "run-status error";
    statusEl.textContent = runError.message.includes("duplicate")
      ? `A payroll run for ${period} already exists for this company — see History.`
      : "Couldn't start payroll run: " + runError.message;
    runBtn.disabled = false;
    runBtn.textContent = "Run payroll";
    return;
  }

  const payslipRows = rows.map(({ emp, calc }) => ({
    payroll_run_id: run.id,
    employee_id: emp.id,
    company: currentCompany,
    full_name: emp.full_name,
    position: emp.position,
    period,
    base_salary: calc.base,
    bonus: calc.bonus,
    gross_salary: calc.gross,
    tax: calc.tax,
    pension: calc.pension,
    hmo: calc.hmo,
    other_deductions: calc.other,
    net_salary: calc.net,
  }));

  const { error: payslipError } = await sb.from("payslips").insert(payslipRows);

  statusEl.hidden = false;
  if (payslipError) {
    statusEl.className = "run-status error";
    statusEl.textContent = "Run created but payslips failed to save: " + payslipError.message;
  } else {
    statusEl.className = "run-status success";
    statusEl.textContent = `Payroll for ${period} completed — ${rows.length} employees paid, ${formatMoney(totals.net)} total net.`;
  }

  runBtn.textContent = "Run payroll";
  loadPayrollRuns();
});

// ---------------------------------------------------------------------
// History
// ---------------------------------------------------------------------
async function loadPayrollRuns() {
  const tbody = document.getElementById("runs-tbody");
  const { data, error } = await sb
    .from("payroll_runs")
    .select("*")
    .eq("company", currentCompany)
    .order("period", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Couldn't load history: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No payroll runs yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((run) => `
    <tr class="run-row" data-run="${run.id}" data-period="${escapeHtml(run.period)}">
      <td>${escapeHtml(run.period)}</td>
      <td class="num">${run.employee_count}</td>
      <td class="num">${formatMoney(run.total_net)}</td>
      <td><button class="btn-link" data-view="${run.id}" data-period-label="${escapeHtml(run.period)}">View</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => loadPayslipsForRun(btn.dataset.view, btn.dataset.periodLabel));
  });
}

async function loadPayslipsForRun(runId, periodLabel) {
  document.getElementById("payslips-title").textContent = `Payslips — ${periodLabel}`;
  const tbody = document.getElementById("payslips-tbody");
  tbody.innerHTML = `<tr><td colspan="3" class="empty-row">Loading…</td></tr>`;

  const { data, error } = await sb
    .from("payslips")
    .select("*")
    .eq("payroll_run_id", runId)
    .order("full_name", { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-row">No payslips found for this run.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((p) => `
    <tr>
      <td>${escapeHtml(p.full_name)}</td>
      <td class="num">${formatMoney(p.net_salary)}</td>
      <td><button class="btn-link" data-pdf='${JSON.stringify(p).replace(/'/g, "&apos;")}'>PDF</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-pdf]").forEach((btn) => {
    btn.addEventListener("click", () => downloadPayslipPdf(JSON.parse(btn.dataset.pdf.replace(/&apos;/g, "'"))));
  });
}

// ---------------------------------------------------------------------
// Payslip PDF
// ---------------------------------------------------------------------
function downloadPayslipPdf(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 56;
  let y = 64;

  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.text("Ledger — Payslip", left, y);

  y += 28;
  doc.setDrawColor(184, 134, 58);
  doc.setLineWidth(1);
  doc.line(left, y, 539, y);

  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Employee:`, left, y); doc.text(p.full_name, left + 110, y);
  y += 18;
  doc.text(`Position:`, left, y); doc.text(p.position || "—", left + 110, y);
  y += 18;
  doc.text(`Pay period:`, left, y); doc.text(p.period, left + 110, y);
  y += 18;
  doc.text(`Issued:`, left, y); doc.text(new Date(p.created_at).toLocaleDateString(), left + 110, y);

  y += 34;
  doc.setFont("helvetica", "bold");
  doc.text("Earnings", left, y);
  doc.text("Amount", 460, y);
  y += 6;
  doc.setLineWidth(0.5);
  doc.line(left, y, 539, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  const line = (label, amount) => {
    doc.text(label, left, y);
    doc.text(formatMoney(amount), 539, y, { align: "right" });
    y += 18;
  };

  line("Base salary", p.base_salary);
  line("Bonus", p.bonus);
  y += 4;
  doc.setFont("helvetica", "bold");
  line("Gross pay", p.gross_salary);

  y += 14;
  doc.text("Deductions", left, y);
  doc.text("Amount", 460, y);
  y += 6;
  doc.line(left, y, 539, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  line("Tax", p.tax);
  line("Pension", p.pension);
  line("HMO", p.hmo || 0);
  line("Other deductions", p.other_deductions);

  y += 14;
  doc.setLineWidth(1);
  doc.line(left, y, 539, y);
  y += 24;
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text("Net pay", left, y);
  doc.text(formatMoney(p.net_salary), 539, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("This payslip was generated automatically by Ledger.", left, 780);

  doc.save(`payslip-${p.full_name.replace(/\s+/g, "_")}-${p.period}.pdf`);
}
