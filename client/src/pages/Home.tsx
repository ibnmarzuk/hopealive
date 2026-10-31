import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  HeartHandshake,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

const heroImage = "/islamic-camp-environment.svg";
const heroImageFallbacks = ["/hopealive-classroom.jpg", "/hopealive-logo.svg"] as const;

const rhythmCards = [
  {
    number: "01",
    title: "Faith",
    copy: "Qur'an, reflection and meaningful conversations that help young hearts connect with Islam.",
    icon: BookOpen,
  },
  {
    number: "02",
    title: "Character",
    copy: "Practical activities and shared responsibility that build confidence, care and good character.",
    icon: Sparkles,
  },
  {
    number: "03",
    title: "Memories",
    copy: "Camping, friendship and joyful moments that participants will carry long after December.",
    icon: HeartHandshake,
  },
];

const registerSteps = [
  {
    number: "01",
    title: "Fill the short form",
    copy: "Register one child, or a family of up to six. We need each name, class and a phone number. Email is optional.",
    icon: Users,
  },
  {
    number: "02",
    title: "Keep the ID or passkey",
    copy: "Each child gets a registration ID. A family also gets one passkey for a single payment and receipt. Copy it and keep it safe for later.",
    icon: Copy,
  },
  {
    number: "03",
    title: "Upload evidence for review",
    copy: "Transfer using the registration ID or family passkey as reference, then upload the receipt. Staff confirm payment after checking the bank account.",
    icon: ShieldCheck,
  },
];

const faqs = [
  {
    question: "Who is the programme for?",
    answer:
      "The IVC 2026 camping programme is for Muslim children, students, workers and parents. It is a community programme designed to nurture young hearts while bringing every generation together.",
  },
  {
    question: "What happens after I register?",
    answer:
      "Your place is saved immediately. Each child gets a registration ID, and a family gets one passkey. To reopen a registration, use its ID or passkey together with the phone number used on the form. Email is optional.",
  },
  {
    question: "Do I need to pay to register?",
    answer:
      "No. Registration is saved before payment, so you can reserve a place first and pay when you are ready. Siblings can register together, share one transfer, and still receive their own IDs for check-in.",
  },
  {
    question: "How is my payment confirmed, and how do I join the WhatsApp group?",
    answer:
      "Transfer the fee using your registration ID or family passkey as the reference. Upload the receipt screenshot so the payment can be reviewed. Our team checks each payment and confirms it manually. Only confirmed participants receive the group link on screen, so please don’t share it publicly.",
  },
  {
    question: "Where and when is IVC 2026?",
    answer:
      "The camp runs from 23rd–28th December, 2026 at Ethical College, behind Okin Filling Station, Opposite Agric, Zango Road, Ilorin.",
  },
  {
    question: "How can I support or enquire?",
    answer:
      "Use WhatsApp 08057782932 for enquiries and support. Donations can be made to Hope-alive Muslim Found., account 0019871510, Jaiz Bank.",
  },
];

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand-mark brand-mark--compact" : "brand-mark"} aria-hidden="true">
      <span className="brand-mark__moon" />
      <span className="brand-mark__star" />
    </span>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [accountCopied, setAccountCopied] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const copyAccountNumber = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText("0019871510");
      setAccountCopied(true);
      toast.success("Account number copied.");
      window.setTimeout(() => setAccountCopied(false), 2500);
    } catch {
      toast.error("Could not copy automatically. Please select the number and copy it manually.");
    }
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <a href="#top" className="wordmark" aria-label="Hope-Alive home">
          <Mark />
          <span>
            <strong>hope-alive</strong>
            <small>Islamic vacation course</small>
          </span>
        </a>
        <nav id="primary-navigation" className={`main-nav ${menuOpen ? "main-nav--open" : ""}`} aria-label="Main navigation">
          <a href="#why" onClick={closeMenu}>About IVC 2026</a>
          <a href="#how" onClick={closeMenu}>How to register</a>
          <a href="#details" onClick={closeMenu}>Camp details</a>
          <a href="#support" onClick={closeMenu}>Donate</a>
          <a className="nav-cta nav-cta--mobile" href="/register" onClick={closeMenu}>Register now <ArrowUpRight size={16} /></a>
        </nav>
        <a className="nav-cta nav-cta--desktop" href="/register">Register now <ArrowUpRight size={16} /></a>
        <button className="menu-toggle" onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-controls="primary-navigation" aria-expanded={menuOpen} type="button">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <h1>A week of faith, <em>learning and lasting memories.</em></h1>
            <p className="hero-lede">Six days of faith, learning and community in Ilorin. Register one participant or a family of up to six; your place is saved before payment.</p>
            <div className="hero-actions">
              <a className="button button--ink button--lg" href="/register">Register a participant <ArrowUpRight size={18} /></a>
              <a className="text-link" href="/register?mode=continue">Continue a registration <span>↘</span></a>
            </div>
            <ul className="hero-assurances">
              <li><Check size={14} /> Free to register — pay later</li>
              <li><Check size={14} /> One child or a family of up to six</li>
              <li><Check size={14} /> Email optional</li>
            </ul>
          </div>
          <div className="hero-visual">
            <div className="hero-image-wrap">
              <img
                src={heroImage}
                alt="Illustrated camping and learning scene for the Hope-Alive Islamic Vacation Course"
                className="hero-image"
                fetchPriority="high"
                decoding="async"
                onError={event => {
                  const image = event.currentTarget;
                  const currentFallbackIndex = heroImageFallbacks.indexOf(image.getAttribute("src") as typeof heroImageFallbacks[number]);
                  const nextFallback = heroImageFallbacks[currentFallbackIndex + 1];
                  if (nextFallback) {
                    image.src = nextFallback;
                  } else {
                    image.hidden = true;
                  }
                }}
              />
              <div className="hero-image-wash" />
            </div>
            <div className="hero-sticker hero-sticker--top">IVC <span>field</span> guide</div>
            <div className="hero-info-card">
              <div className="hero-info-card__top"><span>Camping programme</span><span className="status-pill"><i /> Registration open</span></div>
              <strong>23rd–28th December 2026</strong>
              <small>Ethical College · Ilorin</small>
              <div className="hero-info-card__rule" />
              <div className="hero-info-card__bottom"><span><MapPin size={14} /> Zango Road</span><span>Community programme</span></div>
            </div>
            <div className="hero-arc" aria-hidden="true" />
          </div>
        </section>

        <section className="signal-strip" aria-label="Course highlights">
          <div><span className="signal-icon"><Users size={17} /></span><span><strong>For the whole community</strong><small>children, students, workers and parents</small></span></div>
          <div><span className="signal-icon"><CalendarDays size={17} /></span><span><strong>23rd–28th December</strong><small>IVC 2026 camping programme</small></span></div>
          <div><span className="signal-icon"><ShieldCheck size={17} /></span><span><strong>Register before you pay</strong><small>your place is saved immediately</small></span></div>
        </section>

        <section id="how" className="steps-section section-padding">
          <div className="steps-heading">
            <div>
              <h2>Registration, in<br /><em>three clear steps.</em></h2>
            </div>
            <p>Registration is open to every participant. Siblings can register together, share one payment, and still receive their own IDs.</p>
          </div>
          <div className="steps-grid">
            {registerSteps.map(({ number, title, copy, icon: Icon }) => (
              <article className="step-card" key={title}>
                <div className="step-card__head"><span className="step-card__number">{number}</span><span className="step-card__icon"><Icon size={18} strokeWidth={1.7} /></span></div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="steps-cta">
            <a className="button button--ink button--lg" href="/register">Start registration <ArrowUpRight size={18} /></a>
            <span>No payment needed to reserve a place.</span>
          </div>
        </section>

        <section id="why" className="story-section section-padding">
          <div className="story-aside">
            <p className="story-aside__title">A community course for every generation.</p>
            <span className="story-aside__date">23–28 December 2026<br />Ilorin, Nigeria</span>
          </div>
          <div className="story-content">
            <h2>Learn, reflect and grow together.</h2>
            <p className="story-intro">The Islamic Vacation Course brings faith, education and community together in a six-day camping programme.</p>
            <div className="story-columns">
              <p>Participants include Muslim children, students, workers and parents. The programme makes room for learning, reflection and shared responsibility.</p>
              <p>Families can register siblings together, keep each child’s registration ID, and use one family passkey for a shared payment.</p>
            </div>
            <a href="/register" className="text-link">Register a participant <ArrowUpRight size={16} /></a>
          </div>
        </section>

        <section id="programme" className="programme-section section-padding">
          <div className="programme-heading">
            <div>
              <h2>What the course<br /><em>brings together.</em></h2>
            </div>
            <p>Three parts of the IVC experience, presented without promises or invented outcomes.</p>
          </div>
          <div className="programme-index">
            {rhythmCards.map(({ number, title, copy, icon: Icon }) => (
              <article className="programme-entry" key={title}>
                <div className="programme-entry__index"><span>{number}</span><Icon size={20} strokeWidth={1.7} /></div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="programme-note"><span className="note-line" /><p>Registration is saved before payment. Payment is confirmed separately by the Hope-Alive team.</p><a href="/register">Start registration <ArrowUpRight size={16} /></a></div>
        </section>

        <section id="details" className="details-section section-padding">
          <div className="details-intro">
            <h2>A meaningful<br /><em>December.</em></h2>
            <p>Everything you need to know before you register a participant for this year’s Islamic Vacation Course.</p>
            <a className="button button--ink" href="/register">Register a participant <ArrowUpRight size={18} /></a>
          </div>
          <div className="details-list">
            <div className="detail-row"><span className="detail-icon"><CalendarDays size={19} /></span><div><span className="detail-label">Date</span><strong>23rd–28th December, 2026</strong><p>Six days of camping, learning and community</p></div></div>
            <div className="detail-row"><span className="detail-icon"><MapPin size={19} /></span><div><span className="detail-label">Venue</span><strong>Ethical College, Ilorin</strong><p>Behind Okin Filling Station, Opposite Agric, Zango Road, Ilorin</p></div></div>
            <div className="detail-row"><span className="detail-icon"><Users size={19} /></span><div><span className="detail-label">Categories</span><strong>Muslim children, students, workers and parents</strong><p>A community programme for every generation</p></div></div>
            <div className="detail-row"><span className="detail-icon"><Clock3 size={19} /></span><div><span className="detail-label">Registration</span><strong>Open now — pay later</strong><p>Your place is saved before payment is made</p></div></div>
          </div>
        </section>

        <section id="faq" className="faq-section section-padding">
          <div className="faq-heading"><h2>Questions, answered<br /><em>with care.</em></h2></div>
          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return <div className={`faq-item ${isOpen ? "faq-item--open" : ""}`} key={faq.question}>
                <button className="faq-trigger" onClick={() => setOpenFaq(isOpen ? null : index)} aria-expanded={isOpen}><span><small>0{index + 1}</small>{faq.question}</span><ChevronDown size={20} /></button>
                {isOpen && <div className="faq-answer"><p>{faq.answer}</p></div>}
              </div>;
            })}
          </div>
        </section>

        <section id="support" className="support-section section-padding">
          <div className="support-copy">
            <h2>Give, if you’re able.<br /><em>It’s always optional.</em></h2>
            <p>Donations are separate from registration fees. Contributions support camp needs including welfare, feeding, accommodation, learning materials and transportation. The team acknowledges donations; this website does not process or automatically verify them.</p>
            <div className="support-needs">
              <span><Check size={15} /> Welfare</span><span><Check size={15} /> Feeding</span><span><Check size={15} /> Accommodation</span><span><Check size={15} /> Learning materials</span><span><Check size={15} /> Transportation</span><span><Check size={15} /> Other camp needs</span>
            </div>
            <a className="whatsapp-link" href="https://wa.me/2348057782932" target="_blank" rel="noreferrer"><span>WA</span> Enquiries & support: <strong>08057782932</strong> <ArrowUpRight size={16} /></a>
          </div>
          <div className="support-panel">
            <div className="account-card">
              <span className="detail-label">Donation account</span>
              <strong>Hope-alive Muslim Found.</strong>
              <div className="account-number-row">
                <span className="account-number">0019871510</span>
                <button className="copy-account-button" type="button" aria-label="Copy account number" title="Copy account number" onClick={copyAccountNumber}>
                  {accountCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <span>Jaiz Bank</span>
              <p className="account-card__note">Donations are acknowledged by the team. If you have a question before or after giving, message us on WhatsApp.</p>
              <a className="button button--outline button--full" href="https://wa.me/2348057782932" target="_blank" rel="noreferrer">
                <MessageCircle size={17} /> Ask us about donating
              </a>
            </div>
          </div>
        </section>

        <section className="final-cta section-padding">
          <div className="final-cta__shape final-cta__shape--one" />
          <div className="final-cta__shape final-cta__shape--two" />
          <h2>Give them a week<br /><em>they’ll carry forward.</em></h2>
          <p>Reserve a place at the IVC 2026 camping programme. It takes about a minute, and payment can wait.</p>
          <a className="button button--ink button--lg" href="/register">Register a participant <ArrowUpRight size={18} /></a>
          <a className="text-link text-link--on-sage" href="/register?mode=continue">Continue a registration <span>↘</span></a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><a href="#top" className="wordmark wordmark--footer"><Mark compact /><span><strong>hope-alive</strong><small>Muslim foundation</small></span></a><p>Faith · Education · Community<br />Together, we can build a brighter future.</p></div>
        <div className="footer-links"><div><span>Explore</span><a href="#why">About IVC 2026</a><a href="#how">How to register</a><a href="#details">Camp details</a><a href="/register">Register a participant</a></div><div><span>Connect</span><a href="https://wa.me/2348057782932" target="_blank" rel="noreferrer"><Phone size={14} /> 08057782932</a><a href="#support"><BookOpen size={14} /> Jaiz Bank · 0019871510</a></div></div>
        <div className="footer-bottom"><span>© 2026 Hope-Alive</span><span>Made with intention.</span><a href="#top">Back to top ↑</a></div>
      </footer>
    </div>
  );
}
