import { useMemo, useState } from "react";
import { ArrowLeft, LogIn, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = {
  pending_payment: "Pending payment",
  payment_claimed: "Payment claimed",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Needs clarification",
  completed: "Completed",
};

export default function Admin() {
  const [search, setSearch] = useState("");
  const registrations = trpc.registration.adminList.useQuery(undefined, { retry: false });
  const updateStatus = trpc.registration.adminUpdateStatus.useMutation({
    onSuccess: () => {
      toast.success("Registration status updated.");
      registrations.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return (registrations.data ?? []).filter(item => !query || [item.studentName, item.registrationNumber, item.schoolClass, item.classGroup, item.guardianPhone].some(value => value.toLowerCase().includes(query)));
  }, [registrations.data, search]);

  if (registrations.error) {
    return <div className="admin-page admin-page--center"><div className="admin-login-card"><ShieldCheck size={32} /><span className="section-label">Authorised access</span><h1>Hope-Alive<br /><em>registrations.</em></h1><p>This area is for authorised Hope-Alive administrators. Sign in with your Manus account to review participants and payment status.</p><button className="button button--ink" onClick={() => startLogin()}><LogIn size={17} /> Sign in to continue</button><a href="/" className="plain-action"><ArrowLeft size={15} /> Back to website</a></div></div>;
  }

  return <div className="admin-page">
    <header className="admin-header"><a className="registration-brand" href="/"><span className="registration-brand-mark">HA</span><span><strong>hope-alive</strong><small>Admin dashboard</small></span></a><a className="registration-back" href="/"><ArrowLeft size={16} /> Website</a></header>
    <main className="admin-main"><div className="admin-heading"><div><span className="section-label"><span className="label-dot" /> IVC 2026</span><h1>Registration<br /><em>dashboard.</em></h1><p>Review participants, organise class groups and keep payment status clear.</p></div><div className="admin-summary"><span><strong>{registrations.data?.length ?? 0}</strong><small>Total registrations</small></span><span><strong>{registrations.data?.filter(item => item.paymentStatus === "pending_payment").length ?? 0}</strong><small>Pending payment</small></span><span><strong>{registrations.data?.filter(item => item.paymentStatus === "verified").length ?? 0}</strong><small>Verified</small></span></div></div>
      <div className="admin-toolbar"><label><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, number or class" /></label><span>{filtered.length} shown</span></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Participant</th><th>Group</th><th>Registration no.</th><th>Phone</th><th>Status</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><strong>{item.studentName}</strong><small>{item.schoolClass}</small></td><td>{item.classGroup}</td><td><code>{item.registrationNumber}</code></td><td>{item.guardianPhone}</td><td><select value={item.paymentStatus} onChange={event => updateStatus.mutate({ id: item.id, paymentStatus: event.target.value as "pending_payment" | "payment_claimed" | "under_review" | "verified" | "rejected" | "completed" })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="admin-empty">No registrations match this search.</p>}</div>
    </main>
  </div>;
}
