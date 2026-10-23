import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Image as ImageIcon, LogIn, Mail, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@shared/registration";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";

type AdminRow = inferRouterOutputs<AppRouter>["registration"]["adminList"]["rows"][number];

const emailStatusLabels: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
};

const receiptLabels: Record<string, string> = {
  verified: "Verified",
  needs_review: "Needs review",
  rejected: "Rejected",
};

/** Only an auth failure should prompt a sign-in; everything else is a real error. */
function isAuthError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const code = error.data?.code;
  return code === "UNAUTHORIZED" || code === "FORBIDDEN" || error.message === UNAUTHED_ERR_MSG || error.message === NOT_ADMIN_ERR_MSG;
}

function receiptSummary(row: AdminRow): { label: string; tone: string } {
  if (row.verificationStatus === "verified") return { label: row.verifiedBy === "admin" ? "Verified (admin)" : "Verified (auto)", tone: "verified" };
  if (row.receiptStatus !== "submitted") return { label: "No receipt", tone: "none" };
  const verdict = row.receiptAnalysis?.verdict;
  if (verdict) return { label: receiptLabels[verdict] ?? verdict, tone: verdict };
  return { label: "Awaiting manual review", tone: "needs_review" };
}

/** Full-screen viewer for one receipt plus the model's reasoning. */
function ReceiptDialog({ row, onClose, onDecision, deciding }: { row: AdminRow; onClose: () => void; onDecision: (status: PaymentStatus) => void; deciding: boolean }) {
  const image = trpc.registration.adminReceiptImage.useQuery({ id: row.id });
  const analysis = row.receiptAnalysis;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title">
        <button className="modal-close" onClick={onClose} aria-label="Close receipt"><X size={20} /></button>
        <span className="section-label">Receipt · {row.registrationNumber}</span>
        <h2 id="receipt-dialog-title">{row.studentName}</h2>

        <div className="receipt-dialog__body">
          <div className="receipt-dialog__image">
            {image.isLoading && <p className="admin-empty">Loading receipt…</p>}
            {image.error && <p className="form-error"><AlertTriangle size={16} /> {image.error.message}</p>}
            {image.data?.receiptImage && <img src={image.data.receiptImage} alt={`Receipt uploaded for ${row.registrationNumber}`} />}
            {image.data && !image.data.receiptImage && <p className="admin-empty">No receipt image stored.</p>}
          </div>

          <div className="receipt-dialog__facts">
            {analysis ? (
              <>
                <span className={`receipt-pill receipt-pill--${analysis.verdict}`}>{receiptLabels[analysis.verdict]} · {Math.round(analysis.confidence * 100)}% read confidence</span>
                <dl>
                  <dt>Amount</dt><dd>{analysis.extracted.amount != null ? `${analysis.extracted.currency ?? ""} ${analysis.extracted.amount.toLocaleString()}`.trim() : "—"}</dd>
                  <dt>To account</dt><dd>{analysis.extracted.recipientAccountNumber ?? "—"} {analysis.checks.accountNumberMatches ? <Check size={13} className="ok" /> : <X size={13} className="bad" />}</dd>
                  <dt>Recipient</dt><dd>{analysis.extracted.recipientName ?? "—"} {analysis.checks.recipientNameMatches ? <Check size={13} className="ok" /> : <X size={13} className="bad" />}</dd>
                  <dt>Bank</dt><dd>{analysis.extracted.recipientBank ?? "—"}</dd>
                  <dt>Status</dt><dd>{analysis.extracted.transactionStatus ?? "—"}</dd>
                  <dt>Sender</dt><dd>{analysis.extracted.senderName ?? "—"}</dd>
                  <dt>Reference</dt><dd>{analysis.extracted.reference ?? "—"}</dd>
                  <dt>Date</dt><dd>{analysis.extracted.transactionDate ?? "—"}</dd>
                </dl>
                <p className="receipt-dialog__reasoning">{analysis.reasoning}</p>
                <small>{analysis.model} · {new Date(analysis.analyzedAt).toLocaleString()}</small>
              </>
            ) : (
              <p className="receipt-dialog__reasoning">No automated analysis is stored for this receipt{row.notes ? `: ${row.notes}` : "."}</p>
            )}

            <div className="receipt-dialog__actions">
              {row.verificationStatus !== "verified" && (
                <button className="button button--ink" type="button" disabled={deciding} onClick={() => onDecision("verified")}><Check size={16} /> Approve payment</button>
              )}
              {row.verificationStatus !== "rejected" && (
                <button className="button button--outline" type="button" disabled={deciding} onClick={() => onDecision("rejected")}><X size={16} /> Reject</button>
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
  const [openReceiptId, setOpenReceiptId] = useState<number | null>(null);
  const registrations = trpc.registration.adminList.useQuery(undefined, { retry: false });

  const updateStatus = trpc.registration.adminUpdateStatus.useMutation({
    onSuccess: result => {
      toast.success(result.emailed ? "Status updated and the group-link email sent." : "Registration status updated.");
      registrations.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const resendEmail = trpc.registration.adminResendEmail.useMutation({
    onSuccess: result => {
      toast.success(`Confirmation email re-sent to ${result.recipient}.`);
      registrations.refetch();
    },
    onError: error => toast.error(error.message),
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

  const openRow = openReceiptId == null ? null : rows.find(row => row.id === openReceiptId) ?? null;

  if (registrations.error) {
    if (isAuthError(registrations.error)) {
      return (
        <div className="admin-page admin-page--center">
          <div className="admin-login-card">
            <ShieldCheck size={32} />
            <span className="section-label">Authorised access</span>
            <h1>Hope-Alive<br /><em>registrations.</em></h1>
            <p>This area is for authorised Hope-Alive administrators. Sign in with your Manus account to review participants and payment status.</p>
            <button className="button button--ink" onClick={() => startLogin()}><LogIn size={17} /> Sign in to continue</button>
            <a href="/" className="plain-action"><ArrowLeft size={15} /> Back to website</a>
          </div>
        </div>
      );
    }

    return (
      <div className="admin-page admin-page--center">
        <div className="admin-login-card">
          <AlertTriangle size={32} />
          <span className="section-label">Something went wrong</span>
          <h1>Could not load<br /><em>registrations.</em></h1>
          <p>{registrations.error.message}</p>
          <button className="button button--ink" onClick={() => registrations.refetch()}><RefreshCw size={17} /> Try again</button>
          <a href="/" className="plain-action"><ArrowLeft size={15} /> Back to website</a>
        </div>
      </div>
    );
  }

  const data = registrations.data;
  const warnings: string[] = [];
  if (data && !data.emailConfigured) warnings.push(`Confirmation emails are not being sent: ${data.emailProblem}.`);
  if (data && !data.receiptCheckConfigured) warnings.push(`Automated receipt checks are off (${data.receiptCheckProblem}); every receipt needs manual review.`);
  if (data && data.feeNgn == null) warnings.push("REGISTRATION_FEE_NGN is not set, so receipt amounts cannot be checked automatically.");
  if (data && !data.groupLinkConfigured) warnings.push("WHATSAPP_GROUP_URL is not set; verified families will not receive a group link.");

  const awaitingReview = rows.filter(row => row.receiptStatus === "submitted" && row.verificationStatus === "clarification").length;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <a className="registration-brand" href="/"><span className="registration-brand-mark">HA</span><span><strong>hope-alive</strong><small>Admin dashboard</small></span></a>
        <a className="registration-back" href="/"><ArrowLeft size={16} /> Website</a>
      </header>

      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <span className="section-label"><span className="label-dot" /> IVC 2026</span>
            <h1>Registration<br /><em>dashboard.</em></h1>
            <p>Review participants, confirm payments and keep the group list to verified families only.</p>
          </div>
          <div className="admin-summary">
            <span><strong>{rows.length}</strong><small>Total registrations</small></span>
            <span><strong>{rows.filter(item => item.verificationStatus === "verified").length}</strong><small>Verified</small></span>
            <span><strong>{awaitingReview}</strong><small>Receipts to review</small></span>
            <span><strong>{rows.filter(item => item.emailStatus === "failed").length}</strong><small>Email failures</small></span>
          </div>
        </div>

        {warnings.map(message => (
          <div className="admin-alert" key={message}><AlertTriangle size={17} /><span>{message}</span></div>
        ))}

        <div className="admin-toolbar">
          <label><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, number, email or class" /></label>
          <span>{filtered.length} shown</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Participant</th><th>Group</th><th>Registration no.</th><th>Contact</th><th>Email</th><th>Receipt</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const receipt = receiptSummary(item);
                return (
                  <tr key={item.id}>
                    <td><strong>{item.studentName}</strong><small>{item.schoolClass}</small></td>
                    <td>{item.classGroup}</td>
                    <td><code>{item.registrationNumber}</code></td>
                    <td><span>{item.guardianPhone}</span><small>{item.guardianEmail ?? "No email on file"}</small></td>
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
                      <span className={`receipt-pill receipt-pill--${receipt.tone}`}>{receipt.label}</span>
                      {item.receiptStatus === "submitted" && (
                        <button className="plain-action plain-action--inline" type="button" onClick={() => setOpenReceiptId(item.id)}>
                          <ImageIcon size={13} /> View receipt{item.receiptAttempts > 1 ? ` (${item.receiptAttempts} uploads)` : ""}
                        </button>
                      )}
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
        <ReceiptDialog
          row={openRow}
          onClose={() => setOpenReceiptId(null)}
          deciding={updateStatus.isPending}
          onDecision={status => updateStatus.mutate({ id: openRow.id, paymentStatus: status }, { onSuccess: () => setOpenReceiptId(null) })}
        />
      )}
    </div>
  );
}
