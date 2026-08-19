// ---------------------------------------------------------------------
// Pay calculation — matches the company's official
// "PAYE_Calculator_FOB_Template.xlsx" exactly: Nigerian PAYE tax
// (Consolidated Relief Allowance + the progressive 7/11/15/19/21/24%
// bands), plus the Basic/Housing/Transport/Utility/Leave salary split.
//
// Two things carried over directly from the source template, worth
// double-checking against it:
// 1. The template's header row labels Transport Allowance "(20%)" but
//    the actual formula computes 10% of monthly base pay (matching
//    Basic 54% + Housing 16% + Transport 10% + Utility 10% + Leave
//    10% = exactly 100%). This follows the FORMULA, not the header
//    text — confirm with your accountant if 20% was intended instead.
// 2. Pension rates (template cells AI1/AJ1) are unusual precise
//    fractions — 8.52347427456386% employee, 10.6736243194031%
//    employer — rather than round 8%/10%. Used exactly as given.
//
// Bonus, Driver/Airtime Allowance, HMO, and Other Deductions are this
// app's own additions on top of the template's PAYE-only model — they
// don't appear in the source file, so they're added/subtracted after
// its own Net Pay figure, not folded into the tax calculation.
// ---------------------------------------------------------------------
const EMPLOYER_PENSION_RATE = 10.6736243194031; // % — template cell AJ1, company-wide

function calcPayslip(emp) {
  const monthlyBase = Number(emp.base_salary || 0); // drives the 5-way split below

  const basic = monthlyBase * 0.54;
  const housing = monthlyBase * 0.16;
  const transport = monthlyBase * 0.10; // template FORMULA uses 10% (header text says 20% — see note above)
  const utility = monthlyBase * 0.10;
  const leave = monthlyBase * 0.10;
  const others = Number(emp.other_allowance || 0);

  const gross = basic + housing + transport + utility + leave + others; // monthly Gross Pay
  const annualGrossPay = gross * 12;
  const bht = basic + housing + transport; // pensionable emolument

  const employeePensionRate = Number(emp.pension_rate || 0);
  const employeePension = bht * (employeePensionRate / 100); // monthly
  const employerPension = bht * (EMPLOYER_PENSION_RATE / 100); // monthly, informational only

  const voluntaryContribution = Number(emp.voluntary_contribution || 0);
  const otherTaxReliefs = Number(emp.other_tax_reliefs || 0); // combines Insurance/Mortgage/NHF/NPF/etc.
  const surcharge = Number(emp.surcharge || 0);
  const loanRepayment = Number(emp.loan_repayment || 0);

  // --- Tax: Nigerian PAYE, matching the template's formula exactly ---
  const annualEmployeePension = employeePension * 12;
  const annualTaxableBase = annualGrossPay - annualEmployeePension; // template's "Gross Pay 2"

  let consolRelief;
  if (annualTaxableBase <= 300000) consolRelief = 0;
  else if (annualTaxableBase >= 20000000) consolRelief = annualTaxableBase * 0.21;
  else consolRelief = annualTaxableBase * 0.2 + 200000;

  const otherReliefAnnual = (employeePension + voluntaryContribution + otherTaxReliefs) * 12;
  const totalRelief = consolRelief + otherReliefAnnual;
  const chargeIncome = annualGrossPay - totalRelief; // annual taxable income

  let annualTaxDue;
  if (consolRelief === 0) {
    annualTaxDue = annualGrossPay * 0.01; // minimum tax for very low incomes
  } else {
    const x = chargeIncome;
    if (x <= 300000) annualTaxDue = x * 0.07;
    else if (x <= 600000) annualTaxDue = 21000 + (x - 300000) * 0.11;
    else if (x <= 1100000) annualTaxDue = 54000 + (x - 600000) * 0.15;
    else if (x <= 1600000) annualTaxDue = 129000 + (x - 1100000) * 0.19;
    else if (x <= 3200000) annualTaxDue = 224000 + (x - 1600000) * 0.21;
    else annualTaxDue = 560000 + (x - 3200000) * 0.24;
  }
  const tax = annualTaxDue / 12; // monthly PAYE

  // Template's own Net Pay (its cell AF3):
  //   Monthly Gross − Monthly Tax − Employee Pension − Voluntary − Surcharge − Loan
  const templateNetPay = gross - tax - employeePension - voluntaryContribution - surcharge - loanRepayment;

  // --- This app's extras, layered on top of the template's figures ---
  const bonus = Number(emp.bonus || 0);
  const driverAllowance = Number(emp.driver_allowance || 0);
  const airtimeAllowance = Number(emp.airtime_allowance || 0);
  const hmo = Number(emp.hmo_deduction || 0);
  const otherDeductions = Number(emp.other_deductions || 0);

  const net = templateNetPay + bonus + driverAllowance + airtimeAllowance - hmo - otherDeductions;

  const allowancesTotal = bonus + driverAllowance + airtimeAllowance;
  const totalEarnings = gross + allowancesTotal;
  const deductionsTotal = employeePension + tax + voluntaryContribution + surcharge + loanRepayment + hmo + otherDeductions;

  return {
    gross, basic, housing, transport, utility, leave, others, bht,
    annualGrossPay,
    employeePensionRate, employeePension, employerPension,
    voluntaryContribution, otherTaxReliefs, surcharge, loanRepayment,
    consolRelief, otherReliefAnnual, totalRelief, chargeIncome, annualTaxDue,
    tax, bonus, driverAllowance, airtimeAllowance, otherAllowance: others,
    hmo, otherDeductions, allowancesTotal, totalEarnings, deductionsTotal,
    net,
    leaveAllowanceAnnual: leave * 12,
    // legacy-compat aliases used in a couple of places below
    base: gross, pension: employeePension, other: otherDeductions,
  };
}

// An employee is eligible for pay period P ("YYYY-MM") if:
//   - their hire month is on or before P (they'd started by then), and
//   - they have no exit date, OR their exit month is on or after P
//     (they're still paid for their final month, then excluded after).
// This is what makes onboarding/offboarding automatic — no manual
// active/inactive toggling needed each run.
function isEligibleForPeriod(emp, period) {
  if (emp.deleted_at) return false; // trashed employees are never paid
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

  const staff = employeesForCurrentCompany().filter((e) => !isArchived(e) && !isDeleted(e));

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
      <td class="num">${formatMoney(calc.gross)}</td>
      <td class="num">${formatMoney(calc.allowancesTotal)}</td>
      <td class="num">${formatMoney(calc.employeePension)}</td>
      <td class="num">${formatMoney(calc.tax)}</td>
      <td class="num">${formatMoney(calc.hmo)}</td>
      <td class="num">${formatMoney(calc.otherDeductions)}</td>
      <td class="num">${formatMoney(calc.net)}</td>
      <td><button class="btn-link danger admin-only" data-delete="${emp.id}">Delete</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete));
  });

  const totals = rows.reduce((acc, { calc }) => ({
    gross: acc.gross + calc.gross,
    allowances: acc.allowances + calc.allowancesTotal,
    pension: acc.pension + calc.employeePension,
    tax: acc.tax + calc.tax,
    hmo: acc.hmo + calc.hmo,
    other: acc.other + calc.otherDeductions,
    net: acc.net + calc.net,
  }), { gross: 0, allowances: 0, pension: 0, tax: 0, hmo: 0, other: 0, net: 0 });

  document.getElementById("overview-total-gross").textContent = formatMoney(totals.gross);
  document.getElementById("overview-total-allowances").textContent = formatMoney(totals.allowances);
  document.getElementById("overview-total-pension").textContent = formatMoney(totals.pension);
  document.getElementById("overview-total-tax").textContent = formatMoney(totals.tax);
  document.getElementById("overview-total-hmo").textContent = formatMoney(totals.hmo);
  document.getElementById("overview-total-other").textContent = formatMoney(totals.other);
  document.getElementById("overview-total-net").textContent = formatMoney(totals.net);
  tfoot.hidden = false;
}

// ---------------------------------------------------------------------
// Payment schedule — every active employee's next scheduled payment.
// "Next payment" is the 1st of next calendar month, unless that
// employee wouldn't be eligible yet by then (future hire) or would
// already be past their exit month, in which case they're left off.
// ---------------------------------------------------------------------
function nextPaymentPeriodAndDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const period = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
  const dateLabel = nextMonth.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return { period, dateLabel };
}

function renderPaymentSchedule() {
  const tbody = document.getElementById("schedule-tbody");
  const tfoot = document.getElementById("schedule-tfoot");
  if (!tbody) return;

  const { period, dateLabel } = nextPaymentPeriodAndDate();
  const staff = employeesForCurrentCompany().filter((e) => isEligibleForPeriod(e, period));

  if (!staff.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No one is scheduled to be paid next period (${escapeHtml(dateLabel)}).</td></tr>`;
    tfoot.hidden = true;
    return;
  }

  const rows = staff.map((e) => ({ emp: e, calc: calcPayslip(e) }));

  tbody.innerHTML = rows.map(({ emp, calc }) => `
    <tr>
      <td>${escapeHtml(emp.full_name)}</td>
      <td>${escapeHtml(emp.position || "—")}</td>
      <td>${escapeHtml(dateLabel)}</td>
      <td class="num">${formatMoney(calc.net)}</td>
      <td><button class="btn-link danger admin-only" data-delete="${emp.id}">Delete</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete));
  });

  const totalNet = rows.reduce((sum, { calc }) => sum + calc.net, 0);
  document.getElementById("schedule-total-net").textContent = formatMoney(totalNet);
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
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Choose a period and click Preview.</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Choose a period first.</td></tr>`;
    tfoot.hidden = true;
    runBtn.disabled = true;
    return;
  }

  const eligible = employeesForCurrentCompany().filter((e) => isEligibleForPeriod(e, period));
  if (!eligible.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No employees are eligible for pay in ${escapeHtml(period)} for this company (check hire/exit dates).</td></tr>`;
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
      <td class="num">${formatMoney(calc.allowancesTotal)}</td>
      <td class="num">${formatMoney(calc.employeePension)}</td>
      <td class="num">${formatMoney(calc.tax)}</td>
      <td class="num">${formatMoney(calc.hmo)}</td>
      <td class="num">${formatMoney(calc.otherDeductions)}</td>
      <td class="num">${formatMoney(calc.net)}</td>
    </tr>
  `).join("");

  const totals = rows.reduce((acc, { calc }) => ({
    gross: acc.gross + calc.gross,
    allowances: acc.allowances + calc.allowancesTotal,
    pension: acc.pension + calc.employeePension,
    tax: acc.tax + calc.tax,
    hmo: acc.hmo + calc.hmo,
    other: acc.other + calc.otherDeductions,
    net: acc.net + calc.net,
  }), { gross: 0, allowances: 0, pension: 0, tax: 0, hmo: 0, other: 0, net: 0 });

  document.getElementById("preview-total-gross").textContent = formatMoney(totals.gross);
  document.getElementById("preview-total-allowances").textContent = formatMoney(totals.allowances);
  document.getElementById("preview-total-pension").textContent = formatMoney(totals.pension);
  document.getElementById("preview-total-tax").textContent = formatMoney(totals.tax);
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
    gross_pay: calc.gross,
    basic_salary: calc.basic,
    housing_allowance: calc.housing,
    transport_allowance: calc.transport,
    utility_allowance: calc.utility,
    leave_allowance: calc.leave,
    leave_allowance_annual: calc.leaveAllowanceAnnual,
    other_allowance: calc.otherAllowance,
    annual_gross_pay: calc.annualGrossPay,
    bht: calc.bht,
    bonus: calc.bonus,
    driver_allowance: calc.driverAllowance,
    airtime_allowance: calc.airtimeAllowance,
    gross_salary: calc.totalEarnings,
    employee_pension_rate: calc.employeePensionRate,
    pension: calc.employeePension,
    employer_pension: calc.employerPension,
    voluntary_contribution: calc.voluntaryContribution,
    other_tax_reliefs: calc.otherTaxReliefs,
    surcharge: calc.surcharge,
    loan_repayment: calc.loanRepayment,
    consol_relief: calc.consolRelief,
    other_relief_annual: calc.otherReliefAnnual,
    total_relief: calc.totalRelief,
    charge_income: calc.chargeIncome,
    annual_tax_due: calc.annualTaxDue,
    tax: calc.tax,
    hmo: calc.hmo,
    other_deductions: calc.otherDeductions,
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
      <td class="row-actions">
        <button class="btn-link" data-view="${run.id}" data-period-label="${escapeHtml(run.period)}">View</button>
        <button class="btn-link danger admin-only" data-delete-run="${run.id}" data-period-label="${escapeHtml(run.period)}">Delete</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => loadPayslipsForRun(btn.dataset.view, btn.dataset.periodLabel));
  });
  tbody.querySelectorAll("[data-delete-run]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteFlow("payrollRun", btn.dataset.deleteRun, `Payroll run — ${btn.dataset.periodLabel}`));
  });
}

let currentPayslipsRunId = null;
let currentPayslipsRunLabel = null;

function reloadCurrentPayslips() {
  if (currentPayslipsRunId) loadPayslipsForRun(currentPayslipsRunId, currentPayslipsRunLabel);
}

async function loadPayslipsForRun(runId, periodLabel) {
  currentPayslipsRunId = runId;
  currentPayslipsRunLabel = periodLabel;
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
      <td class="row-actions">
        <button class="btn-link" data-pdf='${JSON.stringify(p).replace(/'/g, "&apos;")}'>PDF</button>
        <button class="btn-link danger admin-only" data-delete-payslip="${p.id}" data-payslip-name="${escapeHtml(p.full_name)}">Delete</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-pdf]").forEach((btn) => {
    btn.addEventListener("click", () => downloadPayslipPdf(JSON.parse(btn.dataset.pdf.replace(/&apos;/g, "'"))));
  });
  tbody.querySelectorAll("[data-delete-payslip]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteFlow("payslip", btn.dataset.deletePayslip, `Payslip — ${btn.dataset.payslipName}`));
  });
}

// ---------------------------------------------------------------------
// Payslip PDF
// ---------------------------------------------------------------------
function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function downloadPayslipPdf(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 56;
  let y = 56;

  // Use the payslip's own company to pick the right logo, so a
  // FiberOne payslip always carries the FiberOne logo and a Kkontech
  // one always carries Kkontech's — regardless of which company tab
  // happens to be selected right now.
  const logoPath = p.company === "fiberone" ? "assets/fiberone-logo.png" : "assets/kkontech-logo.png";
  let headerHeight = 20;

  try {
    const logo = await loadImageAsDataUrl(logoPath);
    const logoHeight = 40;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    doc.addImage(logo.dataUrl, "PNG", left, y, logoWidth, logoHeight);
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 36, 48);
    doc.text("PAYSLIP", left + logoWidth + 18, y + logoHeight / 2 + 5);
    doc.setTextColor(0, 0, 0);
    headerHeight = logoHeight;
  } catch (err) {
    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.text("Ledger — Payslip", left, y + 20);
    headerHeight = 20;
  }

  y += headerHeight + 20;
  doc.setDrawColor(184, 134, 58);
  doc.setLineWidth(1);
  doc.line(left, y, 539, y);

  y += 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Employee:`, left, y); doc.text(p.full_name, left + 100, y);
  y += 16;
  doc.text(`Position:`, left, y); doc.text(p.position || "—", left + 100, y);
  y += 16;
  doc.text(`Pay period:`, left, y); doc.text(p.period, left + 100, y);
  y += 16;
  doc.text(`Issued:`, left, y); doc.text(new Date(p.created_at).toLocaleDateString(), left + 100, y);

  const line = (label, amount, opts = {}) => {
    if (opts.bold) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
    doc.text(label, left, y);
    doc.text(formatMoney(amount), 539, y, { align: "right" });
    y += 16;
  };

  y += 22;
  doc.setFont("helvetica", "bold");
  doc.text("Salary structure (monthly)", left, y);
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(left, y, 539, y);
  y += 16;
  line("Basic salary (54%)", p.basic_salary);
  line("Housing allowance (16%)", p.housing_allowance);
  line("Transport allowance (10%)", p.transport_allowance);
  line("Utility allowance (10%)", p.utility_allowance);
  line("Leave allowance (10%)", p.leave_allowance || 0);
  line("Others", p.other_allowance || 0);
  line("Gross pay", p.gross_pay, { bold: true });

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Other earnings", left, y);
  y += 5;
  doc.line(left, y, 539, y);
  y += 16;
  line("Bonus", p.bonus);
  line("Driver allowance", p.driver_allowance || 0);
  line("Airtime allowance", p.airtime_allowance || 0);
  line("Total earnings", p.gross_salary, { bold: true });

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Tax computation (annual)", left, y);
  y += 5;
  doc.line(left, y, 539, y);
  y += 16;
  line("Consolidated Relief Allowance", p.consol_relief || 0);
  line("Other tax reliefs (annualized)", p.other_relief_annual || 0);
  line("Total relief", p.total_relief || 0);
  line("Taxable income (Charge Income)", p.charge_income || 0);
  line("Annual tax due", p.annual_tax_due || 0, { bold: true });

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Deductions (monthly)", left, y);
  y += 5;
  doc.line(left, y, 539, y);
  y += 16;
  line("Employee pension", p.pension);
  line("Tax (PAYE)", p.tax);
  line("Voluntary pension contribution", p.voluntary_contribution || 0);
  line("Surcharge", p.surcharge || 0);
  line("Loan repayment", p.loan_repayment || 0);
  line("HMO", p.hmo || 0);
  line("Other deductions", p.other_deductions);

  y += 14;
  doc.setLineWidth(1);
  doc.line(left, y, 539, y);
  y += 22;
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text("Net pay", left, y);
  doc.text(formatMoney(p.net_salary), 539, y, { align: "right" });

  y += 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("For reference — not part of monthly net pay:", left, y);
  y += 14;
  doc.text(`Employer pension contribution (10.6736%, B+H+T): ${formatMoney(p.employer_pension || 0)}`, left, y);
  y += 14;
  doc.text(`Annual gross pay: ${formatMoney(p.annual_gross_pay || 0)}`, left, y);

  doc.setFontSize(9);
  doc.text("This payslip was generated automatically by Ledger.", left, 790);

  doc.save(`payslip-${p.full_name.replace(/\s+/g, "_")}-${p.period}.pdf`);
}
