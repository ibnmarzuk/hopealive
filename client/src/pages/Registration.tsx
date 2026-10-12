import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Check, Clipboard, Copy, CreditCard, HelpCircle, MessageCircle, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const classes = ["Nursery 2", "Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6", "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3", "Higher institution and above"];
const groupMap: Record<string, string> = {
  "Nursery 2": "Lower Class", "Basic 1": "Lower Class", "Basic 2": "Lower Class",
  "Basic 3": "Middle Class", "Basic 4": "Middle Class", "Basic 5": "Middle Class", "Basic 6": "Middle Class",
  "JSS 1": "Upper Class", "JSS 2": "Upper Class", "JSS 3": "Upper Class",
  "SS 1": "Advance 1", "SS 2": "Advance 1", "SS 3": "Advance 1",
  "Higher institution and above": "Advance 2",
};

const paymentDetails = {
  accountName: "Hope-alive Muslim Found.",
  accountNumber: "0019871510",
  bank: "Jaiz Bank",
  whatsapp: "2348057782932",
  displayWhatsapp: "08057782932",
};

type RegistrationRecord = {
  id?: number;
  studentName: string;
  guardianPhone: string;
  schoolClass: string;
  classGroup: string;
  registrationNumber: string;
  paymentStatus: string;
};

type View = "form" | "resume" | "success" | "payment" | "confirmation";

export default function Registration() {
  const [, setLocation] = useLocation();
  const initialMode = new URLSearchParams(window.location.search).get("mode");
  const [view, setView] = useState<View>(initialMode === "continue" ? "resume" : "form");
  const [studentName, setStudentName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [record, setRecord] = useState<RegistrationRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const createRegistration = trpc.registration.create.useMutation({
    onSuccess: result => {
      setRecord(result);
      setView("success");
    },
    onError: error => toast.error(error.message),
  });
  const resumeRegistration = trpc.registration.resume.useQuery(
    { registrationNumber: lookupNumber || "LOWER-000", guardianPhone: lookupPhone || "0000000" },
    { enabled: false, retry: false },
  );
  const claimPayment = trpc.registration.claimPayment.useMutation({
    onSuccess: result => {
      setRecord(result);
      setView("confirmation");
    },
    onError: error => toast.error(error.message),
  });

  const selectedGroup = useMemo(() => groupMap[schoolClass], [schoolClass]);
  const whatsappMessage = record ? encodeURIComponent([
    "Payment receipt for Hope-Alive Islamic Vacation Course 2026",
    `Student name: ${record.studentName}`,
    `Registration number: ${record.registrationNumber}`,
    `Parent/guardian phone: ${record.guardianPhone}`,
    `Class: ${record.schoolClass}`,
    `Class group: ${record.classGroup}`,
    "I have attached the payment receipt for verification.",
  ].join("\n")) : "";

  const copyNumber = async () => {
    if (!record) return;
    await navigator.clipboard?.writeText(record.registrationNumber);
    setCopied(true);
    toast.success("Registration number copied.");
  };

  const handleResume = async (event: FormEvent) => {
    event.preventDefault();
    const result = await resumeRegistration.refetch();
    if (result.data) {
      setRecord(result.data);
      setView("payment");
    }
  };

  return (
    <div className="registration-page">
      <header className="registration-header">
        <a className="registration-brand" href="/" aria-label="Back to Hope-Alive home"><span className="registration-brand-mark">HA</span><span><strong>hope-alive</strong><small>Muslim Foundation</small></span></a>
        <a className="registration-back" href="/"><ArrowLeft size={16} /> Back to website</a>
      </header>
      <main className="registration-main">
        <div className="registration-intro">
          <span className="section-label"><span className="label-dot" /> IVC 2026 · 23rd–28th December</span>
          <h1>{view === "resume" ? <>Continue your<br /><em>registration.</em></> : view === "payment" || view === "confirmation" ? <>Payment, made<br /><em>simple.</em></> : <>Register a<br /><em>participant.</em></>}</h1>
          <p>{view === "resume" ? "Use the number and phone number you received when you registered. We will bring your saved registration back." : "A short, clear registration for the Islamic Vacation Course camping programme in Ilorin."}</p>
          <div className="registration-trust"><ShieldCheck size={17} /><span>Your registration is saved before payment. Keep your number safe.</span></div>
        </div>

        <div className="registration-card">
          <div className="registration-progress"><span className={view === "form" || view === "resume" ? "active" : "done"}>1 <b>Register</b></span><i /><span className={view === "success" ? "active" : view === "payment" || view === "confirmation" ? "done" : ""}>2 <b>Payment</b></span><i /><span className={view === "confirmation" ? "active" : ""}>3 <b>Confirm</b></span></div>

          {view === "form" && <form className="simple-form" onSubmit={event => { event.preventDefault(); createRegistration.mutate({ studentName, guardianPhone, schoolClass }); }}>
            <div className="form-heading"><span>Step 1 of 3</span><h2>Tell us who is coming.</h2><p>Every participant gets their own registration number, including siblings.</p></div>
            <label>Student / participant full name<input required value={studentName} onChange={event => setStudentName(event.target.value)} placeholder="e.g. Aisha Ibrahim" /></label>
            <label>Parent or guardian phone number<input required value={guardianPhone} onChange={event => setGuardianPhone(event.target.value)} placeholder="e.g. 0805 778 2932" inputMode="tel" /></label>
            <label>School class<select required value={schoolClass} onChange={event => setSchoolClass(event.target.value)}><option value="">Choose a class</option>{classes.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            {selectedGroup && <div className="class-group-note"><Check size={17} /><span>Your participant will be registered under: <strong>{selectedGroup}</strong></span></div>}
            <button className="button button--ink button--full" type="submit" disabled={createRegistration.isPending}>{createRegistration.isPending ? "Saving registration…" : "Save and continue"} <ArrowUpRight size={18} /></button>
            <button className="plain-action" type="button" onClick={() => setView("resume")}>Already started? Continue a registration <ArrowUpRight size={15} /></button>
          </form>}

          {view === "resume" && <form className="simple-form" onSubmit={handleResume}>
            <div className="form-heading"><span>Continue registration</span><h2>Bring it back.</h2><p>Enter the account number and the same phone number used to register.</p></div>
            <label>Registration / account number<input required value={lookupNumber} onChange={event => setLookupNumber(event.target.value.toUpperCase())} placeholder="e.g. MIDDLE-014" /></label>
            <label>Parent or guardian phone number<input required value={lookupPhone} onChange={event => setLookupPhone(event.target.value)} placeholder="e.g. 0805 778 2932" inputMode="tel" /></label>
            {resumeRegistration.error && <p className="form-error"><HelpCircle size={16} /> {resumeRegistration.error.message}</p>}
            <button className="button button--ink button--full" type="submit" disabled={resumeRegistration.isFetching}>{resumeRegistration.isFetching ? "Finding registration…" : "Continue"} <ArrowUpRight size={18} /></button>
            <button className="plain-action" type="button" onClick={() => setView("form")}><ArrowLeft size={15} /> Register a new participant</button>
          </form>}

          {view === "success" && record && <div className="registration-result">
            <span className="result-check"><Check size={27} /></span><span className="section-label">Registration saved</span><h2>Keep this number<br /><em>safe.</em></h2><p>It is your key for payment and continuing later. We saved {record.studentName} under {record.classGroup}.</p>
            <div className="registration-number-card"><small>Your registration number</small><strong>{record.registrationNumber}</strong><button onClick={copyNumber}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy number"}</button></div>
            <button className="button button--ink button--full" onClick={() => setView("payment")}>Continue to payment <ArrowUpRight size={18} /></button>
            <button className="plain-action" onClick={() => setLocation("/")}>I’ll do this later — return to website</button>
          </div>}

          {view === "payment" && record && <div className="registration-result">
            <span className="section-label">Step 2 of 3 · {record.registrationNumber}</span><h2>Make payment<br /><em>when ready.</em></h2><p>Payment is identified using the registered participant name: <strong>{record.studentName}</strong>.</p>
            <div className="payment-card"><div><small>Registration fee</small><strong>To be confirmed</strong><em>We’ll share the final fee in the support pack.</em></div><div className="payment-account"><small>Pay to</small><strong>{paymentDetails.accountName}</strong><span>{paymentDetails.accountNumber}</span><span>{paymentDetails.bank}</span></div></div>
            <div className="payment-note"><CreditCard size={18} /><span>Make your payment using the details above, then select “I have made payment”. Your receipt is sent manually through WhatsApp.</span></div>
            <button className="button button--ink button--full" onClick={() => claimPayment.mutate({ registrationNumber: record.registrationNumber, guardianPhone: record.guardianPhone })} disabled={claimPayment.isPending}>{claimPayment.isPending ? "Saving payment status…" : "I have made payment"} <ArrowUpRight size={18} /></button>
            <button className="plain-action" onClick={() => setLocation("/")}>Continue later — I’ll keep my number</button>
          </div>}

          {view === "confirmation" && record && <div className="registration-result">
            <span className="result-check"><MessageCircle size={26} /></span><span className="section-label">Step 3 of 3 · Payment claimed</span><h2>Send your receipt<br /><em>on WhatsApp.</em></h2><p>Open WhatsApp and manually attach your payment screenshot. The message will identify the payment using <strong>{record.studentName}</strong> and {record.registrationNumber}.</p>
            <a className="button button--ink button--full" href={`https://wa.me/${paymentDetails.whatsapp}?text=${whatsappMessage}`} target="_blank" rel="noreferrer">Open WhatsApp <ArrowUpRight size={18} /></a>
            <div className="payment-note"><Clipboard size={18} /><span>We do not send the screenshot automatically. Please attach it yourself in WhatsApp.</span></div>
            <button className="plain-action" onClick={() => setLocation("/")}>Return to Hope-Alive website</button>
          </div>}
        </div>
      </main>
      <footer className="registration-footer"><span>Hope-Alive Muslim Foundation</span><span>Faith · Education · Community</span><a href={`https://wa.me/${paymentDetails.whatsapp}`} target="_blank" rel="noreferrer">WhatsApp {paymentDetails.displayWhatsapp}</a></footer>
    </div>
  );
}
