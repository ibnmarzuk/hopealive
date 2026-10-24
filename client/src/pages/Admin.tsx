import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock3, LogIn, LogOut, Mail, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, registrationPricingPhase, type PaymentStatus } from "@shared/registration";
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

function promptConfirmedAmount(expected: number): number | null {
  const value = window.prompt(`Enter the amount confirmed in the bank account (expected ₦${expected.toLocaleString("en-NG")}).`, String(expected));
  if (value === null) return null;
  const amount = Number(value.replace(/[₦,\s]/g, ""));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    toast.error("Enter a valid amount in naira.");
    return null;
  }
  return amount;
}

/** One-word payment state derived from the existing status columns. */
function paymentSummary(row: AdminRow): { label: string; tone: string } {
  if (row.verificationStatus === "verified") return { label: "Confirmed", tone: "verified" };
  if (row.verificationStatus === "rejected") return { label: "Rejected", tone: "rejected" };
  if (row.receiptStatus === "submitted") return { label: "Evidence submitted", tone: "needs_review" };
  return { label: "Pending", tone: "none" };
}

function paymentActionClassName(tone: string): string {
  if (tone === "verified") return "payment-button payment-button--verified";
  if (tone === "needs_review") return "payment-button payment-button--review";
  if (tone === "rejected") return "payment-button payment-button--rejected";
  return "payment-button payment-button--pending";
}

/** Detail view for one registration: all fields, evidence, and manual controls. */
function RegistrationDialog({ row, onClose, onDecision, deciding, familyRows }: { row: AdminRow; onClose: () => void; onDecision: (status: PaymentStatus, actualAmountNgn?: number) => void; deciding: boolean; familyRows: AdminRow[] }) {
  const hasReceipt = row.receiptStatus === "submitted" && (!row.familyCode || row.familyPaymentLead);
  const imageId = row.familyCode ? familyRows.find(member => member.familyPaymentLead)?.id ?? row.id : row.id;
  const image = trpc.registration.adminReceiptImage.useQuery({ id: imageId }, { enabled: hasReceipt });
  const familyTotal = row.familyCode ? familyRows.reduce((sum, member) => sum + (member.feeNgn ?? 0), 0) : row.feeNgn ?? 0;

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
              {row.familyCode && <><dt>Family passkey</dt><dd><code>{row.familyCode}</code></dd><dt>Family size</dt><dd>{familyRows.length} participants</dd></>}
              <dt>Full name</dt><dd>{row.studentName}</dd>
              <dt>Email</dt><dd>{row.guardianEmail ?? "—"}</dd>
              <dt>Phone</dt><dd>{row.guardianPhone}</dd>
              <dt>Class</dt><dd>{row.schoolClass} · {row.classGroup}</dd>
              <dt>Payment status</dt><dd>{PAYMENT_STATUS_LABELS[row.paymentStatus as PaymentStatus] ?? row.paymentStatus}</dd>
              {row.familyCode && <><dt>Family expected total</dt><dd>₦{familyTotal.toLocaleString("en-NG")}</dd>{row.familyPaymentLead && row.verifiedAmountNgn != null && <><dt>Amount confirmed</dt><dd>₦{row.verifiedAmountNgn.toLocaleString("en-NG")}</dd></>}</>}
              <dt>Registered</dt><dd>{formatDate(row.createdAt)}</dd>
              <dt>Pricing phase</dt><dd><span className={`pricing-tag pricing-tag--${registrationPricingPhase(row.createdAt) === "Early bird" ? "early" : registrationPricingPhase(row.createdAt) === "Second phase" ? "second" : "none"}`}>{registrationPricingPhase(row.createdAt)}</span></dd>
              {hasReceipt && <><dt>Evidence sent</dt><dd>{formatDate(row.receiptSubmittedAt)} {row.receiptAttempts > 1 ? `(${row.receiptAttempts} uploads)` : ""}</dd></>}
              {row.verifiedAt && <><dt>Confirmed</dt><dd>{formatDate(row.verifiedAt)} {row.verifiedBy ? `(${row.verifiedBy})` : ""}</dd></>}
            </dl>
            {row.familyCode && <div className="class-group-note">{familyRows.map(member => <div key={member.id}>{member.studentName} · {member.schoolClass} · {member.registrationNumber} · ₦{(member.feeNgn ?? 0).toLocaleString("en-NG")}</div>)}</div>}

            <p className="receipt-dialog__reasoning">Confirm only after checking the bank account. Family registrations share one payment status and one receipt record.</p>

            <div className="receipt-dialog__actions">
              {row.verificationStatus !== "verified" && (
                <button className="button button--ink" type="button" disabled={deciding} onClick={() => { const amount = promptConfirmedAmount(familyTotal); if (amount == null) return; onDecision("verified", amount); }}><Check size={16} /> Confirm payment</button>
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
  const [phaseFilter, setPhaseFilter] = useState<"all" | "early" | "second">("all");
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
    return rows.filter(item => {
      const matchesSearch = !query || [
        item.studentName,
        item.registrationNumber,
        item.familyCode,
        item.schoolClass,
        item.classGroup,
        item.guardianPhone,
        item.guardianEmail,
      ].some(value => typeof value === "string" && value.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      const phase = registrationPricingPhase(item.createdAt);
      if (phaseFilter === "early") return phase === "Early bird";
      if (phaseFilter === "second") return phase === "Second phase";
      return true;
    });
  }, [phaseFilter, rows, search]);

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

  const awaitingReview = rows.filter(row => row.receiptStatus === "submitted" && row.verificationStatus !== "verified" && row.verificationStatus !== "rejected" && (!row.familyCode || row.familyPaymentLead)).length;
  const phaseCounts = useMemo(() => {
    const counts = { early: 0, second: 0 };
    for (const row of rows) {
      const phase = registrationPricingPhase(row.createdAt);
      if (phase === "Early bird") counts.early += 1;
      else if (phase === "Second phase") counts.second += 1;
    }
    return counts;
  }, [rows]);

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
            <span><strong>{phaseCounts.early}</strong><small>Early bird</small></span>
            <span><strong>{phaseCounts.second}</strong><small>Second phase</small></span>
            <span><strong>₦{(data?.confirmedAmountNgn ?? 0).toLocaleString("en-NG")}</strong><small>Amount confirmed</small></span>
            <span><strong>₦{(data?.pendingExpectedAmountNgn ?? 0).toLocaleString("en-NG")}</strong><small>Expected, pending</small></span>
            <span><strong>{awaitingReview}</strong><small>Evidence to review</small></span>
            <span><strong>{rows.filter(item => item.emailStatus === "failed").length}</strong><small>Email failures</small></span>
          </div>
        </div>

        {warnings.map(message => (
          <div className="admin-alert" key={message}><AlertTriangle size={17} /><span>{message}</span></div>
        ))}

        <div className="admin-toolbar">
          <label><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by registration ID, name, email or phone" /></label>
          <div className="admin-toolbar__filters">
            <label className="admin-filter">
              <span>Phase</span>
              <select value={phaseFilter} onChange={event => setPhaseFilter(event.target.value as "all" | "early" | "second")}>
                <option value="all">All</option>
                <option value="early">Early bird</option>
                <option value="second">Second phase</option>
              </select>
            </label>
            <span>{filtered.length} shown</span>
          </div>
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
                    <td><code>{item.registrationNumber}</code>{item.familyCode && <small>Family · {item.familyCode}</small>}</td>
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
                      <small className={`pricing-tag pricing-tag--${registrationPricingPhase(item.createdAt) === "Early bird" ? "early" : registrationPricingPhase(item.createdAt) === "Second phase" ? "second" : "none"}`}>
                        {registrationPricingPhase(item.createdAt)}
                      </small>
                      <button className={paymentActionClassName(payment.tone)} type="button" onClick={() => setOpenId(item.id)}>
                        View details{item.receiptStatus === "submitted" ? " & evidence" : ""}
                      </button>
                    </td>
                    <td>
                      <select
                        value={item.paymentStatus}
                        onChange={event => {
                          const paymentStatus = event.target.value as PaymentStatus;
                          if (paymentStatus !== "verified") {
                            updateStatus.mutate({ id: item.id, paymentStatus });
                            return;
                          }
                          const familyRows = item.familyCode ? rows.filter(row => row.familyCode === item.familyCode) : [item];
                          const expected = familyRows.reduce((sum, member) => sum + (member.feeNgn ?? 0), 0);
                          const amount = promptConfirmedAmount(expected);
                          if (amount == null) return;
                          updateStatus.mutate({ id: item.id, paymentStatus, actualAmountNgn: amount });
                        }}
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
          onDecision={(status, actualAmountNgn) => updateStatus.mutate({ id: openRow.id, paymentStatus: status, actualAmountNgn }, { onSuccess: () => setOpenId(null) })}
          familyRows={rows.filter(row => openRow.familyCode ? row.familyCode === openRow.familyCode : row.id === openRow.id)}
        />
      )}
    </div>
  );
}
