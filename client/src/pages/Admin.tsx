import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock3, LogIn, LogOut, Mail, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@shared/registration";
import { trpc } from "@/lib/trpc";
import { friendlyErrorMessage } from "@/lib/errors";
import type { AppRouter } from "../../../server/routers";

type AdminRow = inferRouterOutputs<AppRouter>["registration"]["adminList"]["rows"][number];

const emailStatusLabels: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
};

/** Only an auth failure should prompt a sign-in; everything else is a real error. */
function isAuthError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const code = error.data?.code;
  return code === "UNAUTHORIZED" || code === "FORBIDDEN" || error.message === UNAUTHED_ERR_MSG || error.message === NOT_ADMIN_ERR_MSG;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

/** One-word payment state derived from the existing status columns. */
function paymentSummary(row: AdminRow): { label: string; tone: string } {
  if (row.verificationStatus === "verified") return { label: "Confirmed", tone: "verified" };
  if (row.verificationStatus === "rejected") return { label: "Rejected", tone: "rejected" };
  if (row.receiptStatus === "submitted") return { label: "Evidence submitted", tone: "needs_review" };
  return { label: "Pending", tone: "none" };
}

/** Detail view for one registration: all fields, evidence, and manual controls. */
function RegistrationDialog({ row, onClose, onDecision, deciding }: { row: AdminRow; onClose: () => void; onDecision: (status: PaymentStatus) => void; deciding: boolean }) {
  const hasReceipt = row.receiptStatus === "submitted";
  const image = trpc.registration.adminReceiptImage.useQuery({ id: row.id }, { enabled: hasReceipt });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title">
        <button className="modal-close" onClick={onClose} aria-label="Close details"><X size={20} /></button>
        <span className="section-label">Registration · {row.registrationNumber}</span>
        <h2 id="receipt-dialog-title">{row.studentName}</h2>

        <div className="receipt-dialog__body">
          <div className="receipt-dialog__image">
            {hasReceipt ? (
              <>
                {image.isLoading && <p className="admin-empty">Loading evidence…</p>}
                {image.error && <p className="form-error"><AlertTriangle size={16} /> {friendlyErrorMessage(image.error)}</p>}
                {image.data?.receiptImage && <img src={image.data.receiptImage} alt={`Payment evidence for ${row.registrationNumber}`} />}
                {image.data && !image.data.receiptImage && <p className="admin-empty">No evidence image stored.</p>}
              </>
            ) : (
              <p className="admin-empty">No payment evidence uploaded. Confirm from the bank statement using the registration ID as the reference.</p>
            )}
          </div>

          <div className="receipt-dialog__facts">
            <span className={`receipt-pill receipt-pill--${paymentSummary(row).tone}`}>{paymentSummary(row).label}</span>
            <dl>
              <dt>Registration ID</dt><dd><code>{row.registrationNumber}</code></dd>
              <dt>Full name</dt><dd>{row.studentName}</dd>
              <dt>Email</dt><dd>{row.guardianEmail ?? "—"}</dd>
              <dt>Phone</dt><dd>{row.guardianPhone}</dd>
              <dt>Class</dt><dd>{row.schoolClass} · {row.classGroup}</dd>
              <dt>Payment status</dt><dd>{PAYMENT_STATUS_LABELS[row.paymentStatus as PaymentStatus] ?? row.paymentStatus}</dd>
              <dt>Registered</dt><dd>{formatDate(row.createdAt)}</dd>
              {hasReceipt && <><dt>Evidence sent</dt><dd>{formatDate(row.receiptSubmittedAt)} {row.receiptAttempts > 1 ? `(${row.receiptAttempts} uploads)` : ""}</dd></>}
              {row.verifiedAt && <><dt>Confirmed</dt><dd>{formatDate(row.verifiedAt)} {row.verifiedBy ? `(${row.verifiedBy})` : ""}</dd></>}
            </dl>

            <p className="receipt-dialog__reasoning">Confirm only after checking the payment reached {row.guardianPhone ? "the account" : "the account"}. Confirming sends the participant their group link by email.</p>

            <div className="receipt-dialog__actions">
              {row.verificationStatus !== "verified" && (
                <button className="button button--ink" type="button" disabled={deciding} onClick={() => onDecision("verified")}><Check size={16} /> Confirm payment</button>
              )}
              {row.verificationStatus !== "rejected" && (
                <button className="button button--outline" type="button" disabled={deciding} onClick={() => onDecision("rejected")}><X size={16} /> Reject</button>
              )}
              {row.paymentStatus !== "pending_payment" && row.verificationStatus !== "verified" && (
                <button className="plain-action plain-action--inline" type="button" disabled={deciding} onClick={() => onDecision("pending_payment")}><Clock3 size={14} /> Reset to pending</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const registrations = trpc.registration.adminList.useQuery(undefined, { retry: false });

  const adminLogin = trpc.auth.adminLogin.useMutation({
    onSuccess: () => {
      setLoginPassword("");
      setLoginError(null);
      registrations.refetch();
    },
    onError: error => setLoginError(friendlyErrorMessage(error)),
  });

  const adminLogout = trpc.auth.adminLogout.useMutation({
    onSuccess: () => {
      toast.success("Signed out.");
      registrations.refetch();
    },
    onError: error => toast.error(friendlyErrorMessage(error)),
  });

  const updateStatus = trpc.registration.adminUpdateStatus.useMutation({
    onSuccess: result => {
      toast.success(result.emailed ? "Payment confirmed and the group-link email sent." : "Registration status updated.");
      registrations.refetch();
    },
    onError: error => toast.error(friendlyErrorMessage(error)),
  });

  const resendEmail = trpc.registration.adminResendEmail.useMutation({
    onSuccess: result => {
      toast.success(`Confirmation email re-sent to ${result.recipient}.`);
      registrations.refetch();
    },
    onError: error => toast.error(friendlyErrorMessage(error)),
  });

  const rows = registrations.data?.rows ?? [];

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter(item =>
      [item.studentName, item.registrationNumber, item.schoolClass, item.classGroup, item.guardianPhone, item.guardianEmail]
        .some(value => typeof value === "string" && value.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  const openRow = openId == null ? null : rows.find(row => row.id === openId) ?? null;

  if (registrations.error) {
    if (isAuthError(registrations.error)) {
      return (
        <div className="admin-page admin-page--center">
          <form
            className="admin-login-card"
            onSubmit={event => {
              event.preventDefault();
              setLoginError(null);
              adminLogin.mutate({ email: loginEmail, password: loginPassword });
            }}
          >
            <ShieldCheck size={32} />
            <span className="section-label">Authorised access</span>
            <h1>Admin<br /><em>sign in.</em></h1>
            <p>Enter your administrator email and password to review participants and confirm payments.</p>
            <label className="admin-login-field">
              Email
              <input type="email" autoComplete="username" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@example.com" required />
            </label>
            <label className="admin-login-field">
              Password
              <input type="password" autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Your password" required />
            </label>
            {loginError && <p className="form-error"><AlertTriangle size={16} /> {loginError}</p>}
            <button className="button button--ink" type="submit" disabled={adminLogin.isPending}>
              <LogIn size={17} /> {adminLogin.isPending ? "Signing in…" : "Sign in"}
            </button>
            <a href="/" className="plain-action"><ArrowLeft size={15} /> Back to website</a>
          </form>
        </div>
      );
    }

    return (
      <div className="admin-page admin-page--center">
        <div className="admin-login-card">
          <AlertTriangle size={32} />
          <span className="section-label">Something went wrong</span>
          <h1>Could not load<br /><em>registrations.</em></h1>
          <p>{friendlyErrorMessage(registrations.error)}</p>
          <button className="button button--ink" onClick={() => registrations.refetch()}><RefreshCw size={17} /> Try again</button>
          <a href="/" className="plain-action"><ArrowLeft size={15} /> Back to website</a>
        </div>
      </div>
    );
  }

  const data = registrations.data;
  const warnings: string[] = [];
  if (data && !data.emailConfigured) warnings.push(`Confirmation emails are not being sent: ${data.emailProblem}.`);
  if (data && !data.groupLinkConfigured) warnings.push("WHATSAPP_GROUP_URL is not set; confirmed families will not receive a group link.");

  const awaitingReview = rows.filter(row => row.receiptStatus === "submitted" && row.verificationStatus !== "verified" && row.verificationStatus !== "rejected").length;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <a className="registration-brand" href="/"><span className="registration-brand-mark">HA</span><span><strong>hope-alive</strong><small>Admin dashboard</small></span></a>
        <div className="admin-header__actions">
          <button className="plain-action" type="button" onClick={() => adminLogout.mutate()} disabled={adminLogout.isPending}><LogOut size={15} /> Sign out</button>
          <a className="registration-back" href="/"><ArrowLeft size={16} /> Website</a>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <span className="section-label"><span className="label-dot" /> IVC 2026</span>
            <h1>Registration<br /><em>dashboard.</em></h1>
            <p>Search by registration ID, review a participant’s details and evidence, then confirm or reject the payment.</p>
          </div>
          <div className="admin-summary">
            <span><strong>{rows.length}</strong><small>Total registrations</small></span>
            <span><strong>{rows.filter(item => item.verificationStatus === "verified").length}</strong><small>Confirmed</small></span>
            <span><strong>{awaitingReview}</strong><small>Evidence to review</small></span>
            <span><strong>{rows.filter(item => item.emailStatus === "failed").length}</strong><small>Email failures</small></span>
          </div>
        </div>

        {warnings.map(message => (
          <div className="admin-alert" key={message}><AlertTriangle size={17} /><span>{message}</span></div>
        ))}

        <div className="admin-toolbar">
          <label><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by registration ID, name, email or phone" /></label>
          <span>{filtered.length} shown</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Participant</th><th>Group</th><th>Registration ID</th><th>Contact</th><th>Email</th><th>Payment</th><th>Set status</th></tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const payment = paymentSummary(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <button className="admin-link" type="button" onClick={() => setOpenId(item.id)}>{item.studentName}</button>
                      <small>{item.schoolClass}</small>
                    </td>
                    <td>{item.classGroup}</td>
                    <td><code>{item.registrationNumber}</code></td>
                    <td><span>{item.guardianPhone}</span><small>Registered {formatDate(item.createdAt)}</small></td>
                    <td>
                      <span className={`email-pill email-pill--${item.emailStatus}`}>{emailStatusLabels[item.emailStatus] ?? item.emailStatus}</span>
                      {item.emailError && <small className="email-pill__error" title={item.emailError}>{item.emailError}</small>}
                      {item.guardianEmail && item.emailStatus !== "sent" && (
                        <button className="plain-action plain-action--inline" type="button" disabled={resendEmail.isPending} onClick={() => resendEmail.mutate({ id: item.id })}>
                          <Mail size={13} /> Resend
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`receipt-pill receipt-pill--${payment.tone}`}>{payment.label}</span>
                      {item.feeNgn != null && <small>Expected: ₦{item.feeNgn.toLocaleString("en-NG")}</small>}
                      <button className="plain-action plain-action--inline" type="button" onClick={() => setOpenId(item.id)}>
                        View details{item.receiptStatus === "submitted" ? " & evidence" : ""}
                      </button>
                    </td>
                    <td>
                      <select
                        value={item.paymentStatus}
                        onChange={event => updateStatus.mutate({ id: item.id, paymentStatus: event.target.value as PaymentStatus })}
                      >
                        {PAYMENT_STATUSES.map(value => <option value={value} key={value}>{PAYMENT_STATUS_LABELS[value]}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {registrations.isLoading && <p className="admin-empty">Loading registrations…</p>}
          {!registrations.isLoading && filtered.length === 0 && <p className="admin-empty">No registrations match this search.</p>}
        </div>
      </main>

      {openRow && (
        <RegistrationDialog
          row={openRow}
          onClose={() => setOpenId(null)}
          deciding={updateStatus.isPending}
          onDecision={status => updateStatus.mutate({ id: openRow.id, paymentStatus: status }, { onSuccess: () => setOpenId(null) })}
        />
      )}
    </div>
  );
}
