// ---------------------------------------------------------------------
// Shared formatting helpers (used by employees.js and payroll.js too)
// ---------------------------------------------------------------------
function formatMoney(n) {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Boot: guard the page, wire up nav + logout
// ---------------------------------------------------------------------
(async function initDashboard() {
  const session = await requireSession();
  if (!session) return; // requireSession already redirected

  const emailEl = document.getElementById("admin-email");
  if (emailEl) emailEl.textContent = session.user.email;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "index.html";
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      const original = refreshBtn.textContent;
      refreshBtn.textContent = "↻ Refreshing…";
      if (typeof loadEmployees === "function") await loadEmployees();
      if (typeof loadPayrollRuns === "function") await loadPayrollRuns();
      refreshBtn.textContent = original;
      refreshBtn.disabled = false;
    });
  }

  // Tab navigation
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      navItems.forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(btn.dataset.panel).classList.add("is-active");
    });
  });

  // Kick off initial data loads (functions defined in employees.js / payroll.js)
  if (typeof loadEmployees === "function") loadEmployees();
  if (typeof loadPayrollRuns === "function") loadPayrollRuns();
  if (typeof initPayPeriodDefault === "function") initPayPeriodDefault();
})();
