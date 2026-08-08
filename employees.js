let allEmployees = [];
let currentEmpTab = "active";
let currentCompany = "kkontech"; // "kkontech" | "fiberone" — set by the sidebar switcher

// An employee is "archived" the moment an exit date is set — no manual
// active/inactive toggle needed. Payroll eligibility (payroll.js) uses
// the actual dates to decide which periods they're paid for.
function isArchived(emp) {
  return !!emp.exit_date;
}

// Employees belonging to the company currently selected in the sidebar.
function employeesForCurrentCompany() {
  return allEmployees.filter((e) => e.company === currentCompany);
}

async function loadEmployees() {
  const tbody = document.getElementById("employees-tbody");
  const { data, error } = await sb
    .from("employees")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Couldn't load employees: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allEmployees = data;
  renderEmployeesTab();
  if (typeof renderPayrollOverview === "function") renderPayrollOverview();
  if (typeof renderPaymentSchedule === "function") renderPaymentSchedule();
}

function renderEmployeesTab() {
  const tbody = document.getElementById("employees-tbody");
  const thead = document.getElementById("employees-thead");
  const companyEmployees = employeesForCurrentCompany();
  const active = companyEmployees.filter((e) => !isArchived(e));
  const archived = companyEmployees.filter(isArchived);

  document.getElementById("count-active").textContent = active.length;
  document.getElementById("count-archived").textContent = archived.length;

  const rows = currentEmpTab === "active" ? active : archived;

  thead.innerHTML = `
    <tr>
      <th>Name</th>
      <th>Position</th>
      <th class="num">Base salary</th>
      <th class="num">Bonus</th>
      <th>${currentEmpTab === "active" ? "Hire date" : "Exit date"}</th>
      <th></th>
    </tr>`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${
      currentEmpTab === "active" ? "No active employees for this company yet. Add your first one above." : "No one archived yet."
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((e) => `
    <tr>
      <td>${escapeHtml(e.full_name)}<br><span style="color:var(--slate);font-size:12px">${escapeHtml(e.email)}</span></td>
      <td>${escapeHtml(e.position || "—")}</td>
      <td class="num">${formatMoney(e.base_salary)}</td>
      <td class="num">${formatMoney(e.bonus)}</td>
      <td>${currentEmpTab === "active" ? formatDate(e.hire_date) : formatDate(e.exit_date)}</td>
      <td class="row-actions">
        <button class="btn-link" data-edit="${e.id}">Edit</button>
        ${currentEmpTab === "active"
          ? `<button class="btn-link danger" data-exit="${e.id}">Mark exited</button>`
          : `<button class="btn-link" data-reinstate="${e.id}">Reinstate</button>`}
        <button class="btn-link danger" data-delete="${e.id}">Delete</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEmployeeModal(btn.dataset.edit));
  });
  tbody.querySelectorAll("[data-exit]").forEach((btn) => {
    btn.addEventListener("click", () => openExitModal(btn.dataset.exit));
  });
  tbody.querySelectorAll("[data-reinstate]").forEach((btn) => {
    btn.addEventListener("click", () => reinstateEmployee(btn.dataset.reinstate));
  });
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete));
  });
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

document.querySelectorAll("[data-emptab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentEmpTab = btn.dataset.emptab;
    document.querySelectorAll("[data-emptab]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    renderEmployeesTab();
  });
});

// ---------------------------------------------------------------------
// Company switcher (sidebar) — scopes Employees, Payroll overview,
// Run payroll, and History to one company at a time.
// ---------------------------------------------------------------------
document.querySelectorAll("[data-company]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentCompany = btn.dataset.company;
    document.querySelectorAll("[data-company]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    renderEmployeesTab();
    if (typeof renderPayrollOverview === "function") renderPayrollOverview();
  if (typeof renderPaymentSchedule === "function") renderPaymentSchedule();
    if (typeof loadPayrollRuns === "function") loadPayrollRuns();
    if (typeof clearPreview === "function") clearPreview();
  });
});

// ---------------------------------------------------------------------
// Add / edit modal
// ---------------------------------------------------------------------
const employeeModal = document.getElementById("employee-modal");
const employeeForm = document.getElementById("employee-form");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function openEmployeeModal(id) {
  const isEdit = !!id;
  document.getElementById("employee-modal-title").textContent = isEdit ? "Edit employee" : "Add employee";
  employeeForm.reset();
  document.getElementById("emp-id").value = "";
  document.getElementById("emp-hire-date").value = todayStr();
  document.getElementById("emp-company").value = currentCompany;

  if (isEdit) {
    const emp = allEmployees.find((e) => e.id === id);
    if (emp) {
      document.getElementById("emp-id").value = emp.id;
      document.getElementById("emp-company").value = emp.company || "kkontech";
      document.getElementById("emp-name").value = emp.full_name;
      document.getElementById("emp-email").value = emp.email;
      document.getElementById("emp-position").value = emp.position || "";
      document.getElementById("emp-base").value = emp.base_salary;
      document.getElementById("emp-bonus").value = emp.bonus;
      document.getElementById("emp-tax").value = emp.tax_rate;
      document.getElementById("emp-pension").value = emp.pension_rate;
      document.getElementById("emp-hmo").value = emp.hmo_deduction;
      document.getElementById("emp-deductions").value = emp.other_deductions;
      document.getElementById("emp-bank").value = emp.bank_name || "";
      document.getElementById("emp-account").value = emp.account_number || "";
      document.getElementById("emp-hire-date").value = emp.hire_date || todayStr();
    }
  }

  employeeModal.hidden = false;
}

function closeEmployeeModal() {
  employeeModal.hidden = true;
}

document.getElementById("add-employee-btn").addEventListener("click", () => openEmployeeModal(null));
document.getElementById("employee-cancel-btn").addEventListener("click", closeEmployeeModal);
employeeModal.addEventListener("click", (e) => { if (e.target === employeeModal) closeEmployeeModal(); });

employeeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("emp-id").value;
  const payload = {
    company: document.getElementById("emp-company").value,
    full_name: document.getElementById("emp-name").value.trim(),
    email: document.getElementById("emp-email").value.trim(),
    position: document.getElementById("emp-position").value.trim(),
    base_salary: Number(document.getElementById("emp-base").value || 0),
    bonus: Number(document.getElementById("emp-bonus").value || 0),
    tax_rate: Number(document.getElementById("emp-tax").value || 0),
    pension_rate: Number(document.getElementById("emp-pension").value || 0),
    hmo_deduction: Number(document.getElementById("emp-hmo").value || 0),
    other_deductions: Number(document.getElementById("emp-deductions").value || 0),
    bank_name: document.getElementById("emp-bank").value.trim(),
    account_number: document.getElementById("emp-account").value.trim(),
    hire_date: document.getElementById("emp-hire-date").value,
  };

  const { error } = id
    ? await sb.from("employees").update(payload).eq("id", id)
    : await sb.from("employees").insert(payload);

  if (error) {
    alert("Couldn't save employee: " + error.message);
    return;
  }

  closeEmployeeModal();
  loadEmployees();
});

// ---------------------------------------------------------------------
// Exit flow — sets exit_date, which automatically archives the
// employee and excludes them from every payroll run after that period.
//
// Hardened against the "invalid uuid ''" class of bug: the modal can
// only ever open with a real, currently-loaded employee's id, and the
// submit handler double-checks that id is still valid before touching
// the database — if either check fails, nothing is sent to Supabase
// and the modal just closes quietly instead of throwing a raw error.
// ---------------------------------------------------------------------
const exitModal = document.getElementById("exit-modal");
const exitForm = document.getElementById("exit-form");

function openExitModal(id) {
  if (!id) return; // no id on the button — nothing to do, don't open
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return; // id doesn't match a known employee — don't open
  document.getElementById("exit-emp-id").value = id;
  document.getElementById("exit-emp-name").textContent = emp.full_name;
  document.getElementById("exit-date").value = todayStr();
  exitModal.hidden = false;
}

document.getElementById("exit-cancel-btn").addEventListener("click", () => { exitModal.hidden = true; });
exitModal.addEventListener("click", (e) => { if (e.target === exitModal) exitModal.hidden = true; });

exitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("exit-emp-id").value;
  const exitDate = document.getElementById("exit-date").value;

  // Belt-and-suspenders: refuse to call Supabase without a real id,
  // rather than letting an empty uuid reach the database and error out.
  if (!id || !allEmployees.some((emp) => emp.id === id)) {
    exitModal.hidden = true;
    alert("That employee record couldn't be found — the list may be out of date. Refreshing now.");
    loadEmployees();
    return;
  }

  const { error } = await sb.from("employees").update({ exit_date: exitDate }).eq("id", id);

  if (error) {
    alert("Couldn't record exit: " + error.message);
    return;
  }

  exitModal.hidden = true;
  loadEmployees();
});

// ---------------------------------------------------------------------
// Reinstate — clears exit_date, moving the employee back to Active.
// ---------------------------------------------------------------------
async function reinstateEmployee(id) {
  if (!id) return;
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return;
  if (!confirm(`Reinstate ${emp.full_name}? They'll be included in payroll again from this point on.`)) return;

  const { error } = await sb.from("employees").update({ exit_date: null }).eq("id", id);
  if (error) {
    alert("Couldn't reinstate: " + error.message);
    return;
  }
  loadEmployees();
}

// ---------------------------------------------------------------------
// Delete — permanent removal, requires a confirmation code (9898).
// This is a lightweight deterrent against accidental clicks, not real
// security: it runs entirely in the browser, so anyone with access to
// the admin dashboard could read it from the page's source. Real
// protection against unauthorized admins still comes from Supabase
// Auth (only accounts you create can log in at all).
// ---------------------------------------------------------------------
const DELETE_CONFIRMATION_CODE = "9898";
const deleteModal = document.getElementById("delete-modal");
const deleteForm = document.getElementById("delete-form");

function openDeleteModal(id) {
  if (!id) return;
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return;
  document.getElementById("delete-emp-id").value = id;
  document.getElementById("delete-emp-name").textContent = emp.full_name;
  document.getElementById("delete-code").value = "";
  document.getElementById("delete-error").hidden = true;
  deleteModal.hidden = false;
}

document.getElementById("delete-cancel-btn").addEventListener("click", () => { deleteModal.hidden = true; });
deleteModal.addEventListener("click", (e) => { if (e.target === deleteModal) deleteModal.hidden = true; });

deleteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("delete-emp-id").value;
  const code = document.getElementById("delete-code").value.trim();
  const errorEl = document.getElementById("delete-error");

  if (code !== DELETE_CONFIRMATION_CODE) {
    errorEl.hidden = false;
    return;
  }

  if (!id || !allEmployees.some((emp) => emp.id === id)) {
    deleteModal.hidden = true;
    loadEmployees();
    return;
  }

  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) {
    alert("Couldn't delete employee: " + error.message);
    return;
  }

  deleteModal.hidden = true;
  loadEmployees();
});

// ---------------------------------------------------------------------
// CSV bulk upload
// Expected header row (case-insensitive):
// full_name,email,position,base_salary,bonus,tax_rate,pension_rate,hmo_deduction,other_deductions,hire_date,bank_name,account_number
// Only full_name and email are required; everything else defaults.
// This is a simple parser — it does not support commas inside a field
// (e.g. "Smith, Jr." in a name). Keep values comma-free.
// ---------------------------------------------------------------------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

document.getElementById("download-template-btn").addEventListener("click", () => {
  const header = "full_name,email,position,base_salary,bonus,tax_rate,pension_rate,hmo_deduction,other_deductions,hire_date,bank_name,account_number";
  const example = "Jane Doe,jane@example.com,Accountant,250000,0,7.5,8,5000,0,2026-08-01,GTBank,0123456789";
  const blob = new Blob([header + "\n" + example + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "staff-upload-template.csv";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("csv-upload-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("csv-status");
  statusEl.hidden = false;
  statusEl.className = "run-status";
  statusEl.textContent = "Reading file…";

  const text = await file.text();
  const rows = parseCsv(text);

  if (!rows.length) {
    statusEl.className = "run-status error";
    statusEl.textContent = "That file had no rows to import.";
    e.target.value = "";
    return;
  }

  let successCount = 0;
  const errors = [];

  for (const row of rows) {
    const fullName = row.full_name || row.name || "";
    const email = row.email || "";
    if (!fullName || !email) {
      errors.push(`Skipped a row — missing name or email.`);
      continue;
    }

    const payload = {
      company: currentCompany,
      full_name: fullName,
      email: email,
      position: row.position || "",
      base_salary: Number(row.base_salary || 0),
      bonus: Number(row.bonus || 0),
      tax_rate: Number(row.tax_rate || 0),
      pension_rate: Number(row.pension_rate || 0),
      hmo_deduction: Number(row.hmo_deduction || 0),
      other_deductions: Number(row.other_deductions || 0),
      hire_date: row.hire_date || todayStr(),
      bank_name: row.bank_name || "",
      account_number: row.account_number || "",
    };

    const { error } = await sb.from("employees").insert(payload);
    if (error) {
      errors.push(`${fullName}: ${error.message}`);
    } else {
      successCount++;
    }
  }

  statusEl.className = errors.length ? "run-status error" : "run-status success";
  statusEl.textContent = errors.length
    ? `Imported ${successCount} of ${rows.length}. Issues: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`
    : `Imported ${successCount} employee${successCount === 1 ? "" : "s"} successfully.`;

  e.target.value = "";
  loadEmployees();
});
