import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowDownToLine, Bell, BriefcaseBusiness, CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3, LayoutDashboard, LogOut, Menu, Search, Users, X } from "lucide-react";
import { request } from "./api";

const today = new Date().toISOString().slice(0, 10);
const monthNow = today.slice(0, 7);
const navItems = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "employees", label: "Employees", icon: Users, hrOnly: true },
  { key: "attendance", label: "Attendance", icon: Clock3 },
  { key: "leaves", label: "Leave management", icon: CalendarDays },
  { key: "payroll", label: "Payroll", icon: CircleDollarSign },
];
const initials = (value = "") => value.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("worksphere-user")); } catch { return null; }
  });
  const [page, setPage] = useState("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);
  const flash = (message) => { setNotice(message); window.setTimeout(() => setNotice(""), 3500); };
  const logout = () => { localStorage.removeItem("worksphere-token"); localStorage.removeItem("worksphere-user"); setUser(null); };
  const fail = useCallback((err) => setError(err.message), []);
  const onLogin = (result) => {
    localStorage.setItem("worksphere-token", result.access_token);
    localStorage.setItem("worksphere-user", JSON.stringify(result.user));
    setUser(result.user);
    setPage(result.user.role === "EMPLOYEE" ? "attendance" : "overview");
  };
  useEffect(() => {
    if (!user) return;
    request("/auth/me").then((current) => {
      setUser(current);
      localStorage.setItem("worksphere-user", JSON.stringify(current));
    }).catch(logout);
  }, []);
  useEffect(() => {
    if (user) request("/notifications").then(setNotifications).catch((err) => setError(err.message));
  }, [user, refreshKey]);
  if (!user) return <AuthScreen onLogin={onLogin} />;
  const visibleNav = navItems.filter((item) => !item.hrOnly || user.role !== "EMPLOYEE");
  const current = visibleNav.find((item) => item.key === page) || visibleNav[0];
  const unread = notifications.filter((item) => !item.is_read).length;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-icon"><Activity size={20} /></div><span>work<span>sphere</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><div className="workspace-mark">W</div><div><strong>WorkSphere Inc.</strong><small>People operations</small></div><ChevronDown size={15} /></div>
      <div className="nav-label">MENU</div>
      <nav>{visibleNav.map(({ key, label, icon: Icon }) => <button className={`nav-item ${page === key ? "active" : ""}`} key={key} onClick={() => { setPage(key); setMobileNav(false); setError(""); }}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-symbol">?</div><strong>Need a hand?</strong><span>Visit our help center</span><button onClick={() => flash("Contact your WorkSphere administrator for help.")}>Get support <span>→</span></button></div>
        <div className="sidebar-profile"><div className="avatar avatar-purple">{initials(user.username)}</div><div className="profile-copy"><strong>{user.username}</strong><small>{user.role.toLowerCase()}</small></div><button className="icon-button" title="Sign out" onClick={logout}><LogOut size={17} /></button></div>
      </div>
    </aside>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="breadcrumb">Workspace <span>/</span> <strong>{current?.label}</strong></div>
        <div className="topbar-actions"><div className="today-label"><CalendarDays size={16} />{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          <div className="notification-wrap"><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationOpen(!notificationOpen)}><Bell size={19} />{unread > 0 && <i />}</button>
            {notificationOpen && <div className="notification-popover"><div className="popover-head"><strong>Notifications</strong><button onClick={() => setNotificationOpen(false)}><X size={16} /></button></div>
              {notifications.length ? notifications.slice(0, 6).map((item) => <button className={`notification-item ${item.is_read ? "" : "unread"}`} key={item.id} onClick={async () => { if (!item.is_read) { await request(`/notifications/${item.id}/read`, { method: "PATCH" }); reload(); } }}><span className="notification-dot" /><span><strong>{item.title}</strong><small>{item.message}</small></span></button>) : <p className="empty-note">You're all caught up.</p>}
            </div>}
          </div><div className="top-user"><div className="avatar avatar-purple">{initials(user.username)}</div><div><strong>{user.username}</strong><small>{user.role}</small></div></div>
        </div>
      </header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">PEOPLE OPERATIONS</div><h1>{pageTitle(page)}</h1><p>{pageSubtitle(page, user.role)}</p></div>{page === "employees" && <button className="button button-primary" onClick={() => window.dispatchEvent(new Event("open-employee-form"))}>+ Add employee</button>}</div>
        {error && <div className="alert alert-error">{error}<button onClick={() => setError("")}><X size={16} /></button></div>}
        {notice && <div className="toast"><Check size={17} />{notice}</div>}
        {page === "overview" && <Overview user={user} refreshKey={refreshKey} onError={fail} />}
        {page === "employees" && <Employees refreshKey={refreshKey} flash={flash} onError={fail} />}
        {page === "attendance" && <Attendance user={user} refreshKey={refreshKey} flash={flash} onError={fail} />}
        {page === "leaves" && <Leaves user={user} refreshKey={refreshKey} flash={flash} onError={fail} />}
        {page === "payroll" && <Payroll user={user} refreshKey={refreshKey} flash={flash} onError={fail} />}
      </div>
    </main>
  </div>;
}

function pageTitle(page) {
  return ({ overview: "Good morning", employees: "Your people", attendance: "Attendance", leaves: "Leave management", payroll: "Payroll" })[page] || "Overview";
}
function pageSubtitle(page, role) {
  if (page === "overview") return role === "EMPLOYEE" ? "Here's what's happening with your workday." : "Here's what's happening across your organization today.";
  return ({ employees: "Manage your team and keep employee information up to date.", attendance: "Track working hours and review attendance history.", leaves: "Review leave requests and keep time off organized.", payroll: "Manage compensation and monthly payslips." })[page];
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setError(""); setBusy(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const isLogin = mode === "login";
    try {
      onLogin(await request(isLogin ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: isLogin ? new URLSearchParams(payload) : JSON.stringify(payload),
        ...(isLogin ? { headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
      }));
    }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="auth-page">
    <div className="auth-panel"><div className="brand auth-brand"><div className="brand-icon"><Activity size={20} /></div><span>work<span>sphere</span></span></div>
      <div className="auth-intro"><div className="eyebrow">PEOPLE, IN GOOD COMPANY</div><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1><p>{mode === "login" ? "Sign in to your workspace and pick up where you left off." : "Register as an employee to get started."}</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && <label>Work email<input name="email" type="email" placeholder="you@company.com" required /></label>}
        {mode === "register" && <label>Full name<input name="full_name" placeholder="Your full name" required /></label>}
        <label>Username<input name="username" autoComplete="username" placeholder="Enter your username" minLength="3" required /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" minLength="8" required /></label>
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <span>→</span></button>
      </form>
      <p className="auth-switch">{mode === "login" ? "New to WorkSphere?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
      <div className="auth-foot">By continuing, you agree to WorkSphere's <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</div>
    </div>
    <div className="auth-showcase"><div className="showcase-content"><div className="showcase-kicker"><span /> YOUR PEOPLE, YOUR PICTURE</div><h2>Great work<br />starts with <em>great people.</em></h2><p>One thoughtful workspace for the people who make your business work.</p>
      <div className="showcase-stats"><div><strong>People first</strong><span>One place for your team</span></div><div><strong>Work, in sync</strong><span>From day one to payday</span></div></div>
      <div className="showcase-card"><div className="showcase-card-top"><span>THIS WEEK</span><span className="live-tag">● LIVE</span></div><div className="showcase-chart">{[35, 54, 43, 77, 61, 90, 72].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div><div className="chart-days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div></div>
      <div className="showcase-bottom">MADE FOR THE PEOPLE BEHIND THE WORK <span>✳</span></div></div></div>
  </div>;
}

function Overview({ user, refreshKey, onError }) {
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const isHR = user.role !== "EMPLOYEE";
  useEffect(() => {
    if (isHR) request("/dashboard").then(setData).catch(onError);
    request("/employees").then(setEmployees).catch(onError);
    request("/leaves").then(setLeaves).catch(onError);
    request("/payroll").then(setPayroll).catch(onError);
  }, [isHR, refreshKey, onError]);
  if (!isHR) return <div className="grid-two employee-welcome">
    <section className="panel welcome-panel"><div className="welcome-art"><div className="sun" /><div className="plant">✳</div></div><div className="eyebrow">YOUR WORKSPACE</div><h2>Welcome, {user.username}.</h2><p>Everything you need for your workday is right here. Head to attendance to check in, or review your latest leave and payroll updates.</p></section>
    <section className="panel"><PanelTitle title="Recent updates" subtitle="Your latest activity" />{leaves.length === 0 && payroll.length === 0 ? <EmptyState text="Your updates will appear here." /> : <div className="activity-list">{[...leaves.slice(0, 2).map((item) => ({ title: `${item.leave_type} leave · ${item.status.toLowerCase()}`, sub: `${dateLabel(item.start_date)} – ${dateLabel(item.end_date)}`, status: item.status })), ...payroll.slice(0, 2).map((item) => ({ title: `Payslip for ${item.month}`, sub: money(item.net_salary), status: "PAID" }))].map((item, i) => <div className="activity-row" key={i}><span className="activity-icon"><CalendarDays size={16} /></span><div><strong>{item.title}</strong><small>{item.sub}</small></div><StatusBadge value={item.status} /></div>)}</div>}</section>
  </div>;
  return <div className="overview-layout">
    <div className="kpi-grid"><Kpi icon={<Users size={18} />} label="Active employees" value={data?.total_employees ?? "—"} note="Current headcount" tone="blue" /><Kpi icon={<Clock3 size={18} />} label="Present today" value={data?.present_today ?? "—"} note="Marked present" tone="green" /><Kpi icon={<CalendarDays size={18} />} label="Pending leave" value={data?.pending_leaves ?? "—"} note="Awaiting your review" tone="orange" /><Kpi icon={<CircleDollarSign size={18} />} label="Payroll this month" value={data ? money(data.payroll_this_month) : "—"} note={monthNow} tone="purple" /></div>
    <div className="grid-two"><section className="panel"><PanelTitle title="Your people" subtitle={`${employees.length} employee${employees.length === 1 ? "" : "s"} in your workspace`} />{employees.length ? <EmployeeTable employees={employees.slice(0, 5)} /> : <EmptyState text="No employees have been added yet." />}</section>
      <section className="panel"><PanelTitle title="Leave requests" subtitle="Latest requests from your team" />{leaves.length ? <div className="activity-list">{leaves.slice(0, 5).map((leave) => <div className="activity-row" key={leave.id}><div className="avatar avatar-small">{initials(leave.employee_name)}</div><div className="activity-main"><strong>{leave.employee_name}</strong><small>{leave.leave_type} · {dateLabel(leave.start_date)}</small></div><StatusBadge value={leave.status} /></div>)}</div> : <EmptyState text="No leave requests to show." />}</section></div>
    <div className="grid-two analytics-grid"><section className="panel"><PanelTitle title="Today’s attendance" subtitle="Team status for today" />{data ? <MetricBars rows={Object.entries(data.attendance_breakdown).map(([label, value]) => ({ label: label.replace("_", " "), value }))} /> : <EmptyState text="Attendance analytics are loading." />}</section>
      <section className="panel"><PanelTitle title="Leave overview" subtitle="Requests by current status" />{data ? <MetricBars rows={Object.entries(data.leave_breakdown).map(([label, value]) => ({ label: label.toLowerCase(), value }))} /> : <EmptyState text="Leave analytics are loading." />}</section></div>
    <div className="insight-banner"><div className="insight-icon">✳</div><div><strong>A little people insight</strong><p>Clear, consistent people data makes it easier to spot what your team needs next.</p></div><span>WORKSPHERE INSIGHTS</span></div>
  </div>;
}

function Employees({ refreshKey, flash, onError }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profile, setProfile] = useState(null);
  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    return request(`/employees${params.size ? `?${params}` : ""}`).then(setRows).catch((err) => onError(err.message));
  }, [search, status, refreshKey]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const open = () => { setEditing(null); setModal(true); }; window.addEventListener("open-employee-form", open); return () => window.removeEventListener("open-employee-form", open); }, []);
  const submit = async (event) => {
    event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const body = editing ? { full_name: payload.full_name, designation: payload.designation, department: payload.department, joining_date: payload.joining_date, salary: Number(payload.salary), status: payload.status } : { ...payload, salary: Number(payload.salary) };
      await request(editing ? `/employees/${editing.id}` : "/employees", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      setModal(false); setEditing(null); flash(editing ? "Employee profile updated." : "Employee account created."); load();
    } catch (err) { onError(err.message); }
  };
  return <><section className="panel table-panel"><div className="table-toolbar"><div><strong>All employees</strong><small>People and their current details</small></div><div className="table-filters"><label className="search-box"><Search size={16} /><input placeholder="Search people…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select className="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div></div>{rows.length ? <EmployeeTable employees={rows} onEdit={(employee) => { setEditing(employee); setModal(true); }} onProfile={async (employee) => { try { setProfile(await request(`/employees/${employee.id}`)); } catch (err) { onError(err.message); } }} /> : <EmptyState text="No employees found." />}</section>
    {modal && <Modal title={editing ? "Edit employee" : "Add an employee"} close={() => setModal(false)}><form className="modal-form" onSubmit={submit}>
      {!editing && <><Field label="Username" name="username" required /><Field label="Work email" name="email" type="email" required /><Field label="Temporary password" name="password" type="password" minLength="8" required /></>}
      <Field label="Full name" name="full_name" required defaultValue={editing?.full_name} /><Field label="Job title" name="designation" required defaultValue={editing?.designation} /><Field label="Department" name="department" required defaultValue={editing?.department} />
      <Field label="Joining date" name="joining_date" type="date" required defaultValue={editing?.joining_date || today} /><Field label="Annual salary" name="salary" type="number" min="0" step="0.01" required defaultValue={editing?.salary} />
      {editing && <label className="field">Status<select name="status" defaultValue={editing.status}><option>ACTIVE</option><option>INACTIVE</option></select></label>}
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setModal(false)}>Cancel</button><button className="button button-primary">{editing ? "Save changes" : "Create employee"}</button></div>
    </form></Modal>}
    {profile && <Modal title="Employee profile" close={() => setProfile(null)}><div className="profile-details"><div className="profile-hero"><div className="avatar avatar-purple">{initials(profile.full_name)}</div><div><h3>{profile.full_name}</h3><p>{profile.designation} · {profile.department}</p></div><StatusBadge value={profile.status} /></div><div className="profile-grid"><div><small>WORK EMAIL</small><strong>{profile.email}</strong></div><div><small>USERNAME</small><strong>{profile.username}</strong></div><div><small>JOINING DATE</small><strong>{dateLabel(profile.joining_date)}</strong></div><div><small>ANNUAL SALARY</small><strong>{money(profile.salary)}</strong></div></div></div></Modal>}
  </>;
}

function EmployeeTable({ employees, onEdit, onProfile }) {
  return <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>DEPARTMENT</th><th>JOB TITLE</th><th>JOINED</th><th>STATUS</th><th /></tr></thead><tbody>{employees.map((employee, index) => <tr key={employee.id}><td><div className="person-cell"><div className={`avatar avatar-${index % 4}`}>{initials(employee.full_name)}</div><span><strong>{onProfile ? <button className="person-link" onClick={() => onProfile(employee)}>{employee.full_name}</button> : employee.full_name}</strong><small>{employee.email}</small></span></div></td><td>{employee.department}</td><td>{employee.designation}</td><td>{dateLabel(employee.joining_date)}</td><td><StatusBadge value={employee.status} /></td><td>{onEdit && <button className="text-button" onClick={() => onEdit(employee)}>Edit</button>}</td></tr>)}</tbody></table></div>;
}

function Attendance({ user, refreshKey, flash, onError }) {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);
  const isHR = user.role !== "EMPLOYEE";
  const load = useCallback(() => {
    request("/attendance").then(setRows).catch((err) => onError(err.message));
    if (isHR) request("/employees").then(setEmployees).catch((err) => onError(err.message));
  }, [isHR, refreshKey]);
  useEffect(() => { load(); }, [load]);
  const todayRow = rows.find((row) => row.date === today);
  const mark = async (action) => { setBusy(true); try { await request(`/attendance/${action}`, { method: "POST" }); flash(action === "check-in" ? "You’re checked in. Have a great day!" : "You’re checked out for the day."); load(); } catch (err) { onError(err.message); } finally { setBusy(false); } };
  const submitManual = async (event) => { event.preventDefault(); const f = new FormData(event.currentTarget); try { await request("/attendance/mark", { method: "POST", body: JSON.stringify({ employee_id: Number(f.get("employee_id")), date: f.get("date"), status: f.get("status") }) }); flash("Attendance record saved."); event.currentTarget.reset(); load(); } catch (err) { onError(err.message); } };
  return <div className="stack-layout">
    {!isHR && <section className="panel checkin-panel"><div className="checkin-copy"><div className="eyebrow">YOUR WORKDAY</div><h2>{todayRow?.check_out ? "You’ve wrapped up for today." : todayRow?.check_in ? "You’re checked in." : "Ready when you are."}</h2><p>{todayRow?.check_in ? `Checked in at ${new Date(todayRow.check_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${todayRow.check_out ? ` · checked out at ${new Date(todayRow.check_out).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : "Start your day by checking in. Remember to check out when you’re done."}</p></div><div className="checkin-actions"><div className="workday-clock">{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}<small>LOCAL TIME</small></div>{!todayRow?.check_in ? <button disabled={busy} className="button button-primary" onClick={() => mark("check-in")}><Clock3 size={17} /> Check in</button> : !todayRow?.check_out ? <button disabled={busy} className="button button-dark" onClick={() => mark("check-out")}><Clock3 size={17} /> Check out</button> : <span className="done-chip"><Check size={16} /> Complete</span>}</div></section>}
    {isHR && <section className="panel"><PanelTitle title="Mark attendance" subtitle="Add a record for an employee" /><form className="inline-form" onSubmit={submitManual}><label className="field">Employee<select name="employee_id" required defaultValue=""><option value="" disabled>Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><Field label="Date" name="date" type="date" defaultValue={today} required /><label className="field">Status<select name="status"><option>PRESENT</option><option>ABSENT</option><option>HALF_DAY</option></select></label><button className="button button-primary">Save record</button></form></section>}
    <section className="panel table-panel"><PanelTitle title="Attendance history" subtitle="Working hours are calculated from check-in and check-out times" />{rows.length ? <div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>DATE</th><th>CHECK IN</th><th>CHECK OUT</th><th>HOURS</th><th>STATUS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.employee_name}</strong></td><td>{dateLabel(row.date)}</td><td>{row.check_in ? new Date(row.check_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</td><td>{row.check_out ? new Date(row.check_out).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</td><td>{row.working_hours ? `${row.working_hours}h` : "—"}</td><td><StatusBadge value={row.status} /></td></tr>)}</tbody></table></div> : <EmptyState text="No attendance records yet." />}</section>
  </div>;
}

function Leaves({ user, refreshKey, flash, onError }) {
  const [rows, setRows] = useState([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const isHR = user.role !== "EMPLOYEE";
  const load = useCallback(() => request("/leaves").then(setRows).catch((err) => onError(err.message)), [refreshKey]);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await request("/leaves", { method: "POST", body: JSON.stringify(payload) }); setApplyOpen(false); flash("Your leave request has been submitted."); load(); } catch (err) { onError(err.message); } };
  const review = async (id, status) => { try { await request(`/leaves/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); flash(`Leave request ${status.toLowerCase()}.`); load(); } catch (err) { onError(err.message); } };
  return <><section className="panel table-panel"><div className="table-toolbar"><div><strong>{isHR ? "Leave requests" : "Your leave history"}</strong><small>{isHR ? "Review and respond to time-off requests" : "Keep track of your time away"}</small></div>{!isHR && <button className="button button-primary" onClick={() => setApplyOpen(true)}>+ Request leave</button>}</div>
    {rows.length ? <div className="table-scroll"><table><thead><tr>{isHR && <th>EMPLOYEE</th>}<th>TYPE</th><th>DATES</th><th>REASON</th><th>STATUS</th>{isHR && <th>ACTION</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{isHR && <td><strong>{row.employee_name}</strong></td>}<td><span className="leave-type">{row.leave_type}</span></td><td>{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</td><td className="reason-cell">{row.reason}</td><td><StatusBadge value={row.status} /></td>{isHR && <td>{row.status === "PENDING" ? <div className="row-actions"><button className="approve-button" onClick={() => review(row.id, "APPROVED")} title="Approve"><Check size={16} /></button><button className="reject-button" onClick={() => review(row.id, "REJECTED")} title="Reject"><X size={16} /></button></div> : "—"}</td>}</tr>)}</tbody></table></div> : <EmptyState text="No leave requests yet." />}</section>
    {applyOpen && <Modal title="Request time off" close={() => setApplyOpen(false)}><form className="modal-form" onSubmit={submit}><label className="field">Leave type<select name="leave_type"><option>SICK</option><option>CASUAL</option><option>PAID</option></select></label><Field label="Start date" name="start_date" type="date" min={today} required /><Field label="End date" name="end_date" type="date" min={today} required /><label className="field full-field">Reason<textarea name="reason" placeholder="Share a little context…" minLength="3" maxLength="2000" required /></label><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setApplyOpen(false)}>Cancel</button><button className="button button-primary">Submit request</button></div></form></Modal>}
  </>;
}

function Payroll({ user, refreshKey, flash, onError }) {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const isHR = user.role !== "EMPLOYEE";
  const load = useCallback(() => { request("/payroll").then(setRows).catch((err) => onError(err.message)); if (isHR) request("/employees").then(setEmployees).catch((err) => onError(err.message)); }, [isHR, refreshKey]);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => { event.preventDefault(); const f = new FormData(event.currentTarget); const payload = Object.fromEntries(f.entries()); payload.employee_id = Number(payload.employee_id); payload.basic_salary = Number(payload.basic_salary); payload.bonus = Number(payload.bonus || 0); payload.deductions = Number(payload.deductions || 0); try { await request("/payroll", { method: "POST", body: JSON.stringify(payload) }); setModal(false); flash("Payroll generated and employee notified."); load(); } catch (err) { onError(err.message); } };
  const download = (row) => { const content = `WorkSphere payslip\nEmployee: ${row.employee_name}\nMonth: ${row.month}\nBasic salary: ${money(row.basic_salary)}\nBonus: ${money(row.bonus)}\nDeductions: ${money(row.deductions)}\nNet salary: ${money(row.net_salary)}\n`; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" })); link.download = `payslip-${row.month}.txt`; link.click(); URL.revokeObjectURL(link.href); };
  return <><section className="panel table-panel"><div className="table-toolbar"><div><strong>{isHR ? "Monthly payroll" : "Your payslips"}</strong><small>{isHR ? "Generated salary statements by employee" : "Your salary statements and payment details"}</small></div>{isHR && <button className="button button-primary" onClick={() => setModal(true)}>+ Generate payroll</button>}</div>
    {rows.length ? <div className="table-scroll"><table><thead><tr>{isHR && <th>EMPLOYEE</th>}<th>MONTH</th><th>BASIC SALARY</th><th>BONUS</th><th>DEDUCTIONS</th><th>NET SALARY</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{isHR && <td><strong>{row.employee_name}</strong></td>}<td>{row.month}</td><td>{money(row.basic_salary)}</td><td className="money-positive">{money(row.bonus)}</td><td>{money(row.deductions)}</td><td><strong>{money(row.net_salary)}</strong></td><td><button className="download-button" onClick={() => download(row)} title="Download payslip"><ArrowDownToLine size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState text="No payroll records yet." />}</section>
    {modal && <Modal title="Generate payroll" close={() => setModal(false)}><form className="modal-form" onSubmit={submit}><label className="field">Employee<select name="employee_id" required defaultValue=""><option value="" disabled>Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><Field label="Payroll month" name="month" type="month" defaultValue={monthNow} required /><Field label="Basic salary" name="basic_salary" type="number" min="0" step="0.01" required /><Field label="Bonus" name="bonus" type="number" min="0" step="0.01" defaultValue="0" /><Field label="Deductions" name="deductions" type="number" min="0" step="0.01" defaultValue="0" /><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setModal(false)}>Cancel</button><button className="button button-primary">Generate payslip</button></div></form></Modal>}
  </>;
}

function Kpi({ icon, label, value, note, tone }) { return <div className="kpi-card"><div className={`kpi-icon ${tone}`}>{icon}</div><span className="kpi-label">{label}</span><strong className="kpi-value">{value}</strong><small>{note}</small></div>; }
function PanelTitle({ title, subtitle }) { return <div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div></div>; }
function MetricBars({ rows }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="metric-bars">{rows.map((row) => <div className="metric-bar-row" key={row.label}><div><span>{row.label}</span><strong>{row.value}</strong></div><div className="metric-track"><i style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</div>;
}
function StatusBadge({ value }) { const normalized = (value || "").toLowerCase().replace("_", "-"); return <span className={`status-badge status-${normalized}`}><i />{(value || "").replace("_", " ")}</span>; }
function EmptyState({ text }) { return <div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={19} /></div><span>{text}</span></div>; }
function Field({ label, name, type = "text", ...props }) { return <label className="field">{label}<input name={name} type={type} {...props} /></label>; }
function Modal({ title, close, children }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal"><div className="modal-header"><div><div className="eyebrow">WORKSPHERE PEOPLE</div><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button></div>{children}</section></div>; }
