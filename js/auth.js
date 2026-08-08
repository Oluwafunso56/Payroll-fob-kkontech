// ---------------------------------------------------------------------
// Shared auth helpers
// ---------------------------------------------------------------------

// If we're on the login page and already have a session, skip straight
// to the dashboard.
async function redirectIfLoggedIn() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) window.location.href = "dashboard.html";
}

// If we're on the dashboard and have NO session, kick back to login.
// Returns the session (or null) so callers can use it.
async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  redirectIfLoggedIn();

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("login-btn");
    const errorEl = document.getElementById("auth-error");

    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "Signing in…";

    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      errorEl.textContent = error.message === "Invalid login credentials"
        ? "Incorrect email or password."
        : error.message;
      errorEl.hidden = false;
      btn.disabled = false;
      btn.textContent = "Sign in";
      return;
    }

    window.location.href = "dashboard.html";
  });
}
