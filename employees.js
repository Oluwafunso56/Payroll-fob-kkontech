let allEmployees = [];
let currentEmpTab = "active";
let currentCompany = "kkontech"; // "kkontech" | "fiberone" — set by the sidebar switcher

// An employee is "archived" the moment an exit date is set.
function isArchived(emp) {
  return !!emp.exit_date;
}

// An employee is "in Trash" the moment a delete date is set — this is
// a soft delete, so they can still be restored.
function isDeleted(emp) {
  return !!emp.deleted_at;
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
  const resetBar = document.getElementById("trash-reset-bar");
  const companyEmployees = employeesForCurrentCompany();
  const active = companyEmployees.filter((e) => !isDeleted(e) && !isArchived(e));
  const archived = companyEmployees.filter((e) => !isDeleted(e) && isArchived(e));
  const trashed = companyEmployees.filter(isDeleted);

  document.getElementById("count-active").textContent = active.length;
  document.getElementById("count-archived").textContent = archived.length;
  document.getElementById("count-deleted").textContent = trashed.length;

  resetBar.hidden = currentEmpTab !== "deleted";

  const rows = currentEmpTab === "active" ? active : currentEmpTab === "archived" ? archived : trashed;
  const dateLabel = currentEmpTab === "active" ? "Hire date" : currentEmpTab === "archived" ? "Exit date" : "Deleted";

  thead.innerHTML = `
    <tr>
      <th>Name</th>
      <th>Position</th>
      <th class="num">Base salary</th>
      <th class="num">Bonus</th>
      <th>${dateLabel}</th>
      <th></th>
    </tr>`;

  if (!rows.length) {
    const emptyMessages = {
      active: "No active employees for this company yet. Add your first one above.",
      archived: "No one archived yet.",
      deleted: "Trash is empty.",
    };
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${emptyMessages[currentEmpTab]}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((e) => {
    const dateValue = currentEmpTab === "active" ? e.hire_date : currentEmpTab === "archived" ? e.exit_date : e.deleted_at;
    let actions;
    if (currentEmpTab === "active") {
      actions = `
        <button class="btn-link" data-edit="${e.id}">Edit</button>
        <button class="btn-link danger" data-exit="${e.id}">Mark exited</button>
        <button class="btn-link danger" data-delete="${e.id}">Delete</button>`;
    } else if (currentEmpTab === "archived") {
      actions = `
        <button class="btn-link" data-edit="${e.id}">Edit</button>
        <button class="btn-link" data-reinstate="${e.id}">Reinstate</button>
        <button class="btn-link danger" data-delete="${e.id}">Delete</button>`;
    } else {
      actions = `<button class="btn-link" data-restore="${e.id}">↺ Restore</button>`;
    }
    return `
    <tr>
      <td>${escapeHtml(e.full_name)}<br><span style="color:var(--slate);font-size:12px">${escapeHtml(e.email)}</span></td>
      <td>${escapeHtml(e.position || "—")}</td>
      <td class="num">${formatMoney(e.base_salary)}</td>
      <td class="num">${formatMoney(e.bonus)}</td>
      <td>${formatDate(dateValue)}</td>
      <td class="row-actions">${actions}</td>
    </tr>`;
  }).join("");

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
  tbody.querySelectorAll("[data-restore]").forEach((btn) => {
    btn.addEventListener("click", () => restoreFromTrash(btn.dataset.restore));
  });
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d.length > 10 ? d : d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
// Payment schedule, Run payroll, and History to one company at a time.
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
// ---------------------------------------------------------------------
const exitModal = document.getElementById("exit-modal");
const exitForm = document.getElementById("exit-form");

function openExitModal(id) {
  if (!id) return;
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return;
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
// Reinstate — clears exit_date, moving the employee from Archived back
// to Active.
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
// Restore from Trash — clears deleted_at only, so the employee lands
// back wherever they were before (Active or Archived, depending on
// whether they still have an exit_date).
// ---------------------------------------------------------------------
async function restoreFromTrash(id) {
  if (!id) return;
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return;

  const { error } = await sb.from("employees").update({ deleted_at: null }).eq("id", id);
  if (error) {
    alert("Couldn't restore: " + error.message);
    return;
  }
  loadEmployees();
}

document.getElementById("restore-all-btn").addEventListener("click", async () => {
  const trashed = employeesForCurrentCompany().filter(isDeleted);
  if (!trashed.length) { alert("Trash is already empty."); return; }
  if (!confirm(`Restore all ${trashed.length} employee(s) from Trash?`)) return;

  const { error } = await sb.from("employees")
    .update({ deleted_at: null })
    .eq("company", currentCompany)
    .not("deleted_at", "is", null);

  if (error) {
    alert("Couldn't restore all: " + error.message);
    return;
  }
  loadEmployees();
});

// ---------------------------------------------------------------------
// Generalized delete flow (PIN-protected, code: 9898)
// Covers three destructive actions, sharing one modal:
//   - "trash"      : soft-delete a single employee (recoverable)
//   - "emptyTrash" : permanently wipe every trashed employee for this
//                    company (NOT recoverable)
//   - "payrollRun" : permanently delete a payroll run + its payslips
//   - "payslip"    : permanently delete a single payslip
//
// This PIN is a lightweight deterrent against accidental clicks, not
// real security — it runs entirely in the browser, so anyone with
// access to the admin dashboard could read it from the page's source.
// Real protection against unauthorized admins still comes from
// Supabase Auth (only accounts you create can log in at all).
// ---------------------------------------------------------------------
const DELETE_CONFIRMATION_CODE = "9898";
const deleteModal = document.getElementById("delete-modal");
const deleteForm = document.getElementById("delete-form");
let deleteContext = null; // { kind, id, name }

const DELETE_CONFIGS = {
  trash: {
    title: "Move to Trash",
    warning: "This moves the employee to Trash. You can restore them later, or permanently erase them from the Trash tab.",
    submitLabel: "Move to Trash",
  },
  emptyTrash: {
    title: "Empty Trash",
    warning: "This permanently erases every employee currently in Trash for this company. This cannot be undone.",
    submitLabel: "Permanently delete all",
  },
  payrollRun: {
    title: "Delete payroll run",
    warning: "This permanently deletes this payroll run and all of its payslips. This cannot be undone.",
    submitLabel: "Delete run",
  },
  payslip: {
    title: "Delete payslip",
    warning: "This permanently deletes this individual payslip. This cannot be undone.",
    submitLabel: "Delete payslip",
  },
};

function openDeleteFlow(kind, id, name) {
  const cfg = DELETE_CONFIGS[kind];
  if (!cfg) return;
  deleteContext = { kind, id, name };
  document.getElementById("delete-modal-title").textContent = cfg.title;
  document.getElementById("delete-warning").textContent = cfg.warning;
  document.getElementById("delete-submit-btn").textContent = cfg.submitLabel;
  document.getElementById("delete-emp-name").textContent = name || "";
  document.getElementById("delete-code").value = "";
  document.getElementById("delete-error").hidden = true;
  deleteModal.hidden = false;
}

// Entry point used by employee row "Delete" buttons everywhere
// (Employees tab, Payroll Overview, Payment Schedule).
function openDeleteModal(id) {
  if (!id) return;
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return;
  openDeleteFlow("trash", id, emp.full_name);
}

document.getElementById("empty-trash-btn").addEventListener("click", () => {
  const trashCount = employeesForCurrentCompany().filter(isDeleted).length;
  if (!trashCount) { alert("Trash is already empty."); return; }
  openDeleteFlow("emptyTrash", null, `${trashCount} employee${trashCount === 1 ? "" : "s"} in Trash`);
});

document.getElementById("delete-cancel-btn").addEventListener("click", () => { deleteModal.hidden = true; deleteContext = null; });
deleteModal.addEventListener("click", (e) => { if (e.target === deleteModal) { deleteModal.hidden = true; deleteContext = null; } });

deleteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!deleteContext) { deleteModal.hidden = true; return; }

  const code = document.getElementById("delete-code").value.trim();
  const errorEl = document.getElementById("delete-error");

  if (code !== DELETE_CONFIRMATION_CODE) {
    errorEl.hidden = false;
    return;
  }

  const { kind, id } = deleteContext;
  let error = null;

  if (kind === "trash") {
    if (!id || !allEmployees.some((emp) => emp.id === id)) {
      deleteModal.hidden = true;
      deleteContext = null;
      loadEmployees();
      return;
    }
    ({ error } = await sb.from("employees").update({ deleted_at: new Date().toISOString() }).eq("id", id));
  } else if (kind === "emptyTrash") {
    ({ error } = await sb.from("employees").delete().eq("company", currentCompany).not("deleted_at", "is", null));
  } else if (kind === "payrollRun") {
    ({ error } = await sb.from("payroll_runs").delete().eq("id", id));
  } else if (kind === "payslip") {
    ({ error } = await sb.from("payslips").delete().eq("id", id));
  }

  if (error) {
    alert("Couldn't complete this action: " + error.message);
    return;
  }

  deleteModal.hidden = true;
  deleteContext = null;

  if (kind === "trash" || kind === "emptyTrash") {
    loadEmployees();
  } else if (kind === "payrollRun") {
    if (typeof loadPayrollRuns === "function") loadPayrollRuns();
    document.getElementById("payslips-tbody").innerHTML = `<tr><td colspan="3" class="empty-row">No run selected.</td></tr>`;
    document.getElementById("payslips-title").textContent = "Select a run";
  } else if (kind === "payslip") {
    if (typeof reloadCurrentPayslips === "function") reloadCurrentPayslips();
  }
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
