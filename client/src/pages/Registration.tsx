import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  CreditCard,
  HelpCircle,
  ImagePlus,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import {
  MAX_RECEIPT_DATA_URL_CHARS,
  SCHOOL_CLASSES,
  findClassGroup,
  registrationFeeNgn,
  familyRegistrationInputSchema,
  registrationLookupSchema,
} from "@shared/registration";
import { trpc } from "@/lib/trpc";
import { friendlyErrorMessage } from "@/lib/errors";
import type { AppRouter } from "../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>;
/** Server-defined public view of a registration; `create` adds the email status. */
type RegistrationRecord = Outputs["registration"]["resume"] & { emailStatus?: string; familyCode?: string | null; registrationType?: string; members?: { registrationNumber: string; studentName: string; schoolClass: string; classGroup: string; feeNgn: number | null }[] };

type View = "form" | "resume" | "success" | "payment";
type FieldErrors = Record<string, string>;

/** Maps a zod flatten() result onto the field names used by this form. */
function collectErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Formats naira without the "NGN" prefix the Intl default adds. */
function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function currentFeeLabel(amount: number | null): string {
  return amount == null ? "Select a class to see the fee" : `Registration fee: ${formatNaira(amount)}`;
}

/**
 * Downscales and re-encodes a receipt image in the browser so uploads stay
 * small and quick on mobile data, and so the server never sees a 12 MB photo.
 */
async function prepareReceiptImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image — a screenshot of the receipt works best.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("We couldn't read that image. Please use a PNG or JPEG screenshot."));
      element.src = objectUrl;
    });

    const MAX_EDGE = 1600;
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process the image.");
    // Flatten transparency so JPEG does not turn it black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > MAX_RECEIPT_DATA_URL_CHARS && quality > 0.4) {
      quality -= 0.15;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrl.length > MAX_RECEIPT_DATA_URL_CHARS) {
      throw new Error("That image is still too large after compressing. Please crop the screenshot to the receipt.");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function Registration() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const initialMode = new URLSearchParams(window.location.search).get("mode");

  const [view, setView] = useState<View>(initialMode === "continue" ? "resume" : "form");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [registrationType, setRegistrationType] = useState<"individual" | "family">("individual");
  const [participants, setParticipants] = useState([{ studentName: "", schoolClass: "" }]);
  const [consentToEmail, setConsentToEmail] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [showErrors, setShowErrors] = useState(false);

  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupErrors, setLookupErrors] = useState<FieldErrors>({});
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupPending, setLookupPending] = useState(false);

  const [record, setRecord] = useState<RegistrationRecord | null>(null);
  const [copied, setCopied] = useState(false);

  // Optional payment-evidence upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [showReupload, setShowReupload] = useState(false);

  const createRegistration = trpc.registration.createFamily.useMutation({
    onSuccess: result => {
      setRecord(result);
      setView("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: error => toast.error(friendlyErrorMessage(error)),
  });

  const submitReceipt = trpc.registration.submitReceipt.useMutation({
    onSuccess: result => {
      setRecord(result);
      setReceiptPreview(null);
      setShowReupload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (result.outcome === "already_verified") {
        toast.success("Your payment is already confirmed.");
      } else {
        toast.success("Payment evidence submitted — pending review.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: error => setReceiptError(friendlyErrorMessage(error)),
  });

  const visibleParticipants = registrationType === "family" ? participants : participants.slice(0, 1);
  const estimatedTotal = visibleParticipants.reduce((sum, participant) => sum + (registrationFeeNgn(participant.schoolClass) ?? 0), 0);

  /** Re-validates while the user types, but only after a failed submit. */
  const revalidate = (next: Partial<Record<string, unknown>>) => {
    if (!showErrors) return;
    const nextType = (next.registrationType as "individual" | "family" | undefined) ?? registrationType;
    const nextParticipants = (next.participants as typeof participants | undefined) ?? participants;
    const candidate = {
      registrationType: nextType,
      participants: nextType === "individual" ? nextParticipants.slice(0, 1) : nextParticipants,
      guardianEmail,
      guardianPhone,
      consentToEmail,
      ...next,
    };
    const parsed = familyRegistrationInputSchema.safeParse(candidate);
    setFormErrors(parsed.success ? {} : collectErrors(parsed.error.issues));
  };

  const handleRegister = (event: FormEvent) => {
    event.preventDefault();
    const participantList = registrationType === "individual" ? [participants[0]] : participants;
    const parsed = familyRegistrationInputSchema.safeParse({ registrationType, participants: participantList, guardianEmail, guardianPhone, consentToEmail });
    if (!parsed.success) {
      setShowErrors(true);
      setFormErrors(collectErrors(parsed.error.issues));
      return;
    }
    setFormErrors({});
    createRegistration.mutate(parsed.data);
  };

  const handleResume = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = registrationLookupSchema.safeParse({ registrationNumber: lookupNumber, guardianPhone: lookupPhone });
    if (!parsed.success) {
      setLookupErrors(collectErrors(parsed.error.issues));
      setLookupMessage(null);
      return;
    }
    setLookupErrors({});
    setLookupMessage(null);
    setLookupPending(true);
    try {
      // Imperative fetch: a disabled query keyed on placeholder inputs cached
      // stale errors between attempts.
      const found = await utils.registration.resume.fetch(parsed.data);
      setRecord(found);
      setView("payment");
    } catch (error) {
      setLookupMessage(friendlyErrorMessage(error, "We could not find that registration."));
    } finally {
      setLookupPending(false);
    }
  };

  const handleReceiptChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReceiptError(null);
    setPreparingImage(true);
    try {
      setReceiptPreview(await prepareReceiptImage(file));
    } catch (error) {
      setReceiptPreview(null);
      setReceiptError(error instanceof Error ? error.message : "We couldn't read that image.");
    } finally {
      setPreparingImage(false);
    }
  };

  const handleReceiptSubmit = () => {
    if (!record || !receiptPreview) return;
    setReceiptError(null);
    submitReceipt.mutate({
      registrationNumber: record.familyCode ?? record.registrationNumber,
      guardianPhone: record.guardianPhone,
      imageDataUrl: receiptPreview,
    });
  };

  const copyNumber = async () => {
    if (!record) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(record.familyCode ?? record.registrationNumber);
      setCopied(true);
      toast.success("Registration ID copied.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy automatically. Please select the ID and copy it manually.");
    }
  };

  const fieldError = (name: string) => (showErrors ? formErrors[name] : undefined);

  const isVerified = record?.verificationStatus === "verified";
  const isRejected = !isVerified && record?.verificationStatus === "rejected";
  const isPendingReview = !isVerified && !isRejected && record?.receiptStatus === "submitted";
  const uploadsExhausted = (record?.receiptAttemptsLeft ?? 1) <= 0;
  // Uploader is available until verified, unless the user has an untouched
  // pending submission (then they confirm via the "upload a clearer one" link).
  const showUploader = Boolean(record) && !isVerified && !uploadsExhausted && (!isPendingReview || showReupload);

  const introHeading =
    view === "resume" ? <>Continue your<br /><em>registration.</em></>
    : view === "payment" && isVerified ? <>Payment<br /><em>confirmed.</em></>
    : view === "payment" ? <>Payment, made<br /><em>simple.</em></>
    : <>Register a<br /><em>participant.</em></>;

  const introCopy =
    view === "resume" ? "Use the registration ID and phone number you received when you registered. We will bring your saved registration back."
    : view === "payment" ? "Pay by bank transfer, then optionally upload your receipt. Our team confirms your payment using your registration ID."
    : "A short, clear registration for the Islamic Vacation Course camping programme in Ilorin.";

  return (
    <div className="registration-page">
      <header className="registration-header">
        <a className="registration-brand" href="/" aria-label="Back to Hope-Alive home"><span className="registration-brand-mark">HA</span><span><strong>hope-alive</strong><small>Muslim Foundation</small></span></a>
        <a className="registration-back" href="/"><ArrowLeft size={16} /> Back to website</a>
      </header>

      <main className="registration-main">
        <div className="registration-intro">
          <span className="section-label"><span className="label-dot" /> IVC 2026 · 23rd–28th December</span>
          <h1>{introHeading}</h1>
          <p>{introCopy}</p>
          <div className="registration-trust"><ShieldCheck size={17} /><span>Your place is saved before payment. Keep your registration ID safe — it is how we find and confirm your payment.</span></div>
        </div>

        <div className="registration-card">
          <div className="registration-progress">
            <span className={view === "form" || view === "resume" ? "active" : "done"}>1 <b>Register</b></span><i />
            <span className={view === "success" || (view === "payment" && !isVerified) ? "active" : isVerified ? "done" : ""}>2 <b>Payment</b></span><i />
            <span className={isVerified ? "active" : ""}>3 <b>Confirmed</b></span>
          </div>

          {view === "form" && (
            <form className="simple-form" onSubmit={handleRegister} noValidate>
              <div className="form-heading">
                <span>Step 1 of 3</span>
                <h2>Register a child or family.</h2>
                <p>Each child gets an individual ID. Families share one passkey and can pay with one transfer and receipt.</p>
              </div>

              <label>Registration type<select value={registrationType} onChange={event => { const value = event.target.value as "individual" | "family"; setRegistrationType(value); if (value === "individual") setParticipants(current => [current[0]]); else if (participants.length < 2) setParticipants(current => [...current, { studentName: "", schoolClass: "" }]); }}><option value="individual">Individual · one child</option><option value="family">Family · 2 to 6 children</option></select></label>
              {registrationType === "family" && <label>Number of children<select value={participants.length} onChange={event => { const count = Number(event.target.value); setParticipants(current => Array.from({ length: count }, (_, index) => current[index] ?? { studentName: "", schoolClass: "" })); }}><option value={2}>2 children</option><option value={3}>3 children</option><option value={4}>4 children</option><option value={5}>5 children</option><option value={6}>6 children</option></select></label>}

              {visibleParticipants.map((participant, index) => (
                <div className="participant-fields" key={index}>
                  <h3>{registrationType === "family" ? `Child ${index + 1}` : "Participant"}</h3>
                  <label>
                    Student / participant full name
                    <input
                      value={participant.studentName}
                      onChange={event => {
                        const next = participants.map((item, i) => i === index ? { ...item, studentName: event.target.value } : item);
                        setParticipants(next);
                        revalidate({ participants: next });
                      }}
                      placeholder="e.g. Aisha Ibrahim"
                      autoComplete={index === 0 ? "name" : "off"}
                      aria-invalid={Boolean(fieldError(`participants.${index}.studentName`))}
                    />
                    {fieldError(`participants.${index}.studentName`) && <small className="field-error">{fieldError(`participants.${index}.studentName`)}</small>}
                  </label>
                  <label>
                    School class
                    <select
                      value={participant.schoolClass}
                      onChange={event => {
                        const next = participants.map((item, i) => i === index ? { ...item, schoolClass: event.target.value } : item);
                        setParticipants(next);
                        revalidate({ participants: next });
                      }}
                      aria-invalid={Boolean(fieldError(`participants.${index}.schoolClass`) || fieldError("participants"))}
                    >
                      <option value="">Choose a class</option>
                      {SCHOOL_CLASSES.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    {fieldError(`participants.${index}.schoolClass`) && <small className="field-error">{fieldError(`participants.${index}.schoolClass`)}</small>}
                  </label>
                  {participant.schoolClass && <small className="field-hint">{findClassGroup(participant.schoolClass)} · {currentFeeLabel(registrationFeeNgn(participant.schoolClass))}</small>}
                </div>
              ))}

              <label>
                Email address (optional)
                <input
                  value={guardianEmail}
                  onChange={event => { setGuardianEmail(event.target.value); revalidate({ guardianEmail: event.target.value }); }}
                  placeholder="e.g. parent@example.com"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-invalid={Boolean(fieldError("guardianEmail"))}
                  aria-describedby="email-hint"
                />
                <small id="email-hint" className="field-hint"><Mail size={12} /> Email is optional. Save the passkey and participant IDs shown after registration.</small>
                {fieldError("guardianEmail") && <small className="field-error">{fieldError("guardianEmail")}</small>}
              </label>

              <label>
                Parent or guardian phone number
                <input
                  value={guardianPhone}
                  onChange={event => { setGuardianPhone(event.target.value); revalidate({ guardianPhone: event.target.value }); }}
                  placeholder="e.g. 0805 778 2932"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={Boolean(fieldError("guardianPhone"))}
                />
                {fieldError("guardianPhone") && <small className="field-error">{fieldError("guardianPhone")}</small>}
              </label>

              <div className="payment-card"><div><small>{registrationType === "family" ? "Estimated family total" : "Estimated fee"}</small><strong>{formatNaira(estimatedTotal)}</strong><em>Final quote is saved at registration and uses each class fee.</em></div></div>

              <label className="form-check">
                <input
                  type="checkbox"
                  checked={consentToEmail}
                  onChange={event => { setConsentToEmail(event.target.checked); revalidate({ consentToEmail: event.target.checked }); }}
                  aria-invalid={Boolean(fieldError("consentToEmail"))}
                />
                  <span>Email me the passkey, participant IDs and IVC 2026 details (optional).</span>
              </label>
              {fieldError("consentToEmail") && <small className="field-error">{fieldError("consentToEmail")}</small>}

              {createRegistration.isError && (
                <p className="form-error"><HelpCircle size={16} /> {createRegistration.error.message}</p>
              )}

              <button className="button button--ink button--full" type="submit" disabled={createRegistration.isPending}>
                {createRegistration.isPending ? "Saving registration…" : "Save and continue"} <ArrowUpRight size={18} />
              </button>
              <button className="plain-action" type="button" onClick={() => setView("resume")}>Already started? Continue a registration <ArrowUpRight size={15} /></button>
            </form>
          )}

          {view === "resume" && (
            <form className="simple-form" onSubmit={handleResume} noValidate>
              <div className="form-heading">
                <span>Continue registration</span>
                <h2>Bring it back.</h2>
                <p>Enter your registration ID and the same phone number used to register.</p>
              </div>

              <label>
                Registration ID
                <input
                  value={lookupNumber}
                  onChange={event => setLookupNumber(event.target.value.toUpperCase())}
                  placeholder="e.g. MIDDLE-014"
                  aria-invalid={Boolean(lookupErrors.registrationNumber)}
                />
                {lookupErrors.registrationNumber && <small className="field-error">{lookupErrors.registrationNumber}</small>}
              </label>

              <label>
                Parent or guardian phone number
                <input
                  value={lookupPhone}
                  onChange={event => setLookupPhone(event.target.value)}
                  placeholder="e.g. 0805 778 2932"
                  inputMode="tel"
                  aria-invalid={Boolean(lookupErrors.guardianPhone)}
                />
                {lookupErrors.guardianPhone && <small className="field-error">{lookupErrors.guardianPhone}</small>}
              </label>

              {lookupMessage && <p className="form-error"><HelpCircle size={16} /> {lookupMessage}</p>}

              <button className="button button--ink button--full" type="submit" disabled={lookupPending}>
                {lookupPending ? "Finding registration…" : "Continue"} <ArrowUpRight size={18} />
              </button>
              <button className="plain-action" type="button" onClick={() => setView("form")}><ArrowLeft size={15} /> Register a new participant</button>
            </form>
          )}

          {view === "success" && record && (
            <div className="registration-result">
              <span className="result-check"><Check size={27} /></span>
              <span className="section-label">Registration saved</span>
              <h2>Keep this {record.familyCode ? "passkey" : "ID"}<br /><em>safe.</em></h2>
              <p>{record.familyCode
                ? "Use the family passkey for the single payment and receipt. Each child also has a separate participant ID for check-in."
                : "Use this registration ID as your payment reference. Keep it — you will need it to continue later."}</p>

              <div className="registration-number-card">
                <small>{record.familyCode ? "Family passkey" : "Participant registration ID"}</small>
                <strong>{record.familyCode ?? record.registrationNumber}</strong>
                <button onClick={copyNumber}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : record.familyCode ? "Copy passkey" : "Copy ID"}</button>
              </div>

              {record.members?.map(member => <div className="class-group-note" key={member.registrationNumber}><span><strong>{member.studentName}</strong> · {member.schoolClass} · {member.registrationNumber} · {member.feeNgn == null ? "Fee unavailable" : formatNaira(member.feeNgn)}</span></div>)}

              {record.emailStatus === "sent" ? (
                <div className="email-status email-status--ok">
                  <Mail size={17} />
                  <span>We’ve sent your registration ID to <strong>{record.guardianEmail}</strong>. If it hasn’t arrived in a few minutes, check your spam folder.</span>
                </div>
              ) : record.emailStatus === "skipped" || !record.guardianEmail ? (
                <div className="email-status email-status--ok">
                  <ShieldCheck size={17} />
                  <span>No confirmation email was sent. Copy the ID above and keep it safe — it is how you continue later.</span>
                </div>
              ) : (
                <div className="email-status email-status--warn">
                  <AlertTriangle size={17} />
                  <span>Your registration is saved, but we could not send the confirmation email right now. Please copy your ID above — you can also reach us on WhatsApp {record.payment.enquiriesPhone}.</span>
                </div>
              )}

              <button className="button button--ink button--full" onClick={() => setView("payment")}>Continue to payment <ArrowUpRight size={18} /></button>
              <button className="plain-action" onClick={() => setLocation("/")}>I’ll do this later — return to website</button>
            </div>
          )}

          {view === "payment" && record && (
            <div className="registration-result">
              {isVerified ? (
                <>
                  <span className="result-check result-check--verified"><Sparkles size={26} /></span>
                  <span className="section-label">Step 3 of 3 · {record.registrationNumber}</span>
                  <h2>You’re all<br /><em>set.</em></h2>
                  <p>{record.studentName}’s place at IVC 2026 is confirmed under {record.classGroup}. We’ve also emailed this confirmation{record.guardianEmail ? <> to <strong>{record.guardianEmail}</strong></> : null}.</p>

                  {record.whatsappGroupUrl ? (
                    <div className="group-card">
                      <span className="group-card__label"><MessageCircle size={15} /> Participants’ WhatsApp group</span>
                      <p>This link is for confirmed participants only — please don’t forward it.</p>
                      <a className="button button--ink button--full" href={record.whatsappGroupUrl} target="_blank" rel="noreferrer">Join the group <ArrowUpRight size={18} /></a>
                    </div>
                  ) : (
                    <div className="email-status email-status--ok">
                      <Mail size={17} />
                  <span>Your payment is confirmed. Contact the organizers for the participants’ WhatsApp link when it is available.</span>
                    </div>
                  )}

                  <button className="plain-action" onClick={() => setLocation("/")}>Return to Hope-Alive website</button>
                </>
              ) : (
                <>
                  <span className="section-label">Step 2 of 3 · {record.registrationNumber}</span>
                  <h2>Pay, then keep<br /><em>your ID.</em></h2>
                  <p>{record.familyCode
                    ? "Transfer the full amount using the family passkey as the reference. One receipt covers every participant in this family; our team confirms it in the dashboard."
                    : "Transfer the fee using the registration ID as the reference, then optionally upload a receipt screenshot."}</p>

                  <div className="registration-number-card">
                    <small>{record.familyCode ? "Family passkey (use as payment reference)" : "Registration ID (use as payment reference)"}</small>
                    <strong>{record.familyCode ?? record.registrationNumber}</strong>
                    <button onClick={copyNumber}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy reference"}</button>
                  </div>
                  {record.members?.map(member => <div className="class-group-note" key={member.registrationNumber}><span>{member.studentName} · {member.schoolClass} · <strong>{member.registrationNumber}</strong> · {member.feeNgn == null ? "Fee unavailable" : formatNaira(member.feeNgn)}</span></div>)}

                  <div className="payment-card">
                    <div>
                      <small>Registration fee</small>
                      <strong>{record.feeNgn != null ? formatNaira(record.feeNgn) : "To be confirmed"}</strong>
                      {record.feeNgn == null && <em>Choose a class to calculate the fee.</em>}
                    </div>
                    <div className="payment-account">
                      <small>Pay to</small>
                      <strong>{record.payment.accountName}</strong>
                      <span>{record.payment.accountNumber}</span>
                      <span>{record.payment.bank}</span>
                    </div>
                  </div>

                  {isPendingReview && !showReupload && (
                    <div className="verdict-card verdict-card--review">
                      <Clock3 size={18} />
                      <div>
                        <strong>Evidence received — pending review</strong>
                        <p>{record.receiptMessage}</p>
                        {!uploadsExhausted && <button className="plain-action plain-action--inline" type="button" onClick={() => setShowReupload(true)}><RefreshCw size={13} /> Upload a clearer receipt instead</button>}
                      </div>
                    </div>
                  )}

                  {isRejected && (
                    <div className="verdict-card verdict-card--rejected">
                      <AlertTriangle size={18} />
                      <div>
                        <strong>We couldn’t confirm your payment</strong>
                        <p>{record.receiptMessage}</p>
                      </div>
                    </div>
                  )}

                  {uploadsExhausted && !isVerified && (
                    <div className="verdict-card verdict-card--review">
                      <HelpCircle size={18} />
                      <div>
                        <strong>Upload limit reached</strong>
                        <p>Please message us on WhatsApp {record.payment.enquiriesPhone} with your registration ID and we’ll confirm your payment manually.</p>
                      </div>
                    </div>
                  )}

                  {showUploader && (
                    <div className="receipt-upload">
                      <p className="receipt-upload__intro"><CreditCard size={15} /> Optional: upload your receipt. Submitting it does <strong>not</strong> confirm payment — our team reviews every payment.</p>
                      <input
                        ref={fileInputRef}
                        id="receipt-file"
                        className="receipt-upload__input"
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptChosen}
                        disabled={preparingImage || submitReceipt.isPending}
                      />
                      {receiptPreview ? (
                        <div className="receipt-preview">
                          <img src={receiptPreview} alt="Preview of your uploaded receipt" />
                          <div className="receipt-preview__actions">
                            <label htmlFor="receipt-file" className="plain-action plain-action--inline"><RefreshCw size={13} /> Choose a different image</label>
                          </div>
                        </div>
                      ) : (
                        <label htmlFor="receipt-file" className={`receipt-dropzone ${preparingImage ? "receipt-dropzone--busy" : ""}`}>
                          <span className="receipt-dropzone__icon"><ImagePlus size={22} /></span>
                          <strong>{preparingImage ? "Preparing image…" : "Upload your receipt screenshot"}</strong>
                          <span>PNG or JPEG · the amount, recipient and status should be visible</span>
                        </label>
                      )}

                      {receiptError && <p className="form-error"><HelpCircle size={16} /> {receiptError}</p>}

                      <button
                        className="button button--ink button--full"
                        type="button"
                        onClick={handleReceiptSubmit}
                        disabled={!receiptPreview || submitReceipt.isPending || preparingImage}
                      >
                        {submitReceipt.isPending ? "Submitting…" : "Submit receipt for review"} <ArrowUpRight size={18} />
                      </button>
                      <p className="payment-note payment-note--tight"><Clock3 size={16} /><span>{record.receiptAttemptsLeft} upload{record.receiptAttemptsLeft === 1 ? "" : "s"} left for this registration.</span></p>
                    </div>
                  )}

                  <button className="plain-action" onClick={() => setLocation("/")}>Continue later — I’ll keep my ID</button>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="registration-footer">
        <span>Hope-Alive Muslim Foundation</span>
        <span>Faith · Education · Community</span>
        <a href="https://wa.me/2348057782932" target="_blank" rel="noreferrer">Enquiries · WhatsApp 08057782932</a>
      </footer>
    </div>
  );
}
