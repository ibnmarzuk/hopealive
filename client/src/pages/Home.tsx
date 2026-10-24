import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  HeartHandshake,
  Mail,
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

const rhythmCards = [
  {
    number: "01",
    title: "Faith",
    copy: "Qur'an, reflection and meaningful conversations that help young hearts connect with Islam.",
    icon: BookOpen,
    tone: "sage",
  },
  {
    number: "02",
    title: "Character",
    copy: "Practical activities and shared responsibility that build confidence, care and good character.",
    icon: Sparkles,
    tone: "apricot",
  },
  {
    number: "03",
    title: "Memories",
    copy: "Camping, friendship and joyful moments that participants will carry long after December.",
    icon: HeartHandshake,
    tone: "lavender",
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
    icon: Mail,
  },
  {
    number: "03",
    title: "Pay and keep your ID",
    copy: "Transfer the fee using the registration ID or family passkey as the reference. Our team confirms payment, and confirmed participants get the group link.",
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
      "Your place is saved immediately. You get a registration ID for each child, and a family passkey if you registered siblings together. Email is optional, and your registration can always be reopened later with the same ID or passkey.",
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

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="section-label">{children}</p>;
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
        <nav className={`main-nav ${menuOpen ? "main-nav--open" : ""}`} aria-label="Main navigation">
          <a href="#why" onClick={closeMenu}>About IVC 2026</a>
          <a href="#how" onClick={closeMenu}>How to register</a>
          <a href="#details" onClick={closeMenu}>Camp details</a>
          <a href="#support" onClick={closeMenu}>Donate</a>
          <a className="nav-cta nav-cta--mobile" href="/register" onClick={closeMenu}>Register now <ArrowUpRight size={16} /></a>
        </nav>
        <a className="nav-cta nav-cta--desktop" href="/register">Register now <ArrowUpRight size={16} /></a>
        <button className="menu-toggle" onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <SectionLabel><span className="label-dot" /> Islamic Vacation Course 2026</SectionLabel>
            <h1>Reserve their place <em>today.</em></h1>
            <p className="hero-lede">Register one child or a family for the IVC 2026 camping programme in Ilorin. Your place is saved straight away, and payment can wait until you are ready.</p>
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
              <img src={heroImage} alt="Islamic Vacation Course 2026 camping retreat environment with domes, crescent moon and Quran learning emblem" className="hero-image" referrerPolicy="no-referrer" />
              <div className="hero-image-wash" />
            </div>
            <div className="hero-sticker hero-sticker--top">learn <span>with</span> heart</div>
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
              <SectionLabel>How to register</SectionLabel>
              <h2>Three steps,<br /><em>one minute.</em></h2>
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
            <SectionLabel>About IVC 2026</SectionLabel>
            <span className="aside-number">01<span>/03</span></span>
            <p>More than a holiday. A chance to nurture young hearts.</p>
          </div>
          <div className="story-content">
            <h2>Nurture young hearts with the light of Islam.</h2>
            <p className="story-intro">The Islamic Vacation Course is a unique opportunity to build character, deepen faith and create lasting memories in a safe, enriching camping environment.</p>
            <div className="story-columns">
              <p>Hope-Alive Muslim Foundation brings together faith, education and community so every participant can grow in confidence, compassion and responsibility.</p>
              <p>Six days of camping, learning and friendship in Ilorin, guided by people who care about where these young people are headed.</p>
            </div>
            <a href="/register" className="circle-link">Register a participant <ArrowUpRight size={19} /></a>
          </div>
        </section>

        <section id="programme" className="programme-section section-padding">
          <div className="programme-heading">
            <div>
              <SectionLabel>The programme</SectionLabel>
              <h2>Faith, character<br /><em>and lasting memories.</em></h2>
            </div>
            <p>Camping, learning and community come together in a programme designed to leave a lasting mark on every young heart.</p>
          </div>
          <div className="rhythm-grid">
            {rhythmCards.map(({ number, title, copy, icon: Icon, tone }) => (
              <article className={`rhythm-card rhythm-card--${tone}`} key={title}>
                <div className="rhythm-card__head"><span>{number}</span><Icon size={22} strokeWidth={1.6} /></div>
                <h3>{title}</h3>
                <p>{copy}</p>
                <span className="rhythm-card__arrow">↗</span>
              </article>
            ))}
          </div>
          <div className="programme-note"><span className="note-line" /><p><strong>Our promise:</strong> a safe, enriching and impactful experience for every participant.</p><a href="/register">Register a participant <ArrowUpRight size={16} /></a></div>
        </section>

        <section className="quote-section section-padding">
          <div className="quote-mark">“</div>
          <blockquote>“Whoever relieves a believer’s distress of the distresses of this world, Allah will relieve his distress on the Day of Resurrection.”</blockquote>
          <div className="quote-byline"><span className="quote-avatar">ﷺ</span><span><strong>The reward of giving</strong><small>Sahih Muslim</small></span></div>
        </section>

        <section id="details" className="details-section section-padding">
          <div className="details-intro">
            <SectionLabel>Camp details</SectionLabel>
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

        <section id="stories" className="stories-section section-padding">
          <div className="stories-topline"><SectionLabel>Make a difference</SectionLabel><span>02<span>/03</span></span></div>
          <div className="stories-layout">
            <div className="stories-copy"><h2>The moments that<br /><em>stay with you.</em></h2><p>We measure a good camp in stronger character, deeper faith, new friendships and memories that keep giving long after the tents come down.</p><a href="/register" className="text-link">Register a participant <span>↘</span></a></div>
            <div className="story-cards">
              <article className="story-card story-card--olive"><span className="story-card__quote">“</span><p>Every contribution brings us closer to a safe, enriching and impactful experience for every participant.</p><span className="story-card__name">— Hope-Alive Muslim Foundation</span></article>
              <article className="story-card story-card--cream"><span className="story-card__quote">“</span><p>Together we can build a brighter future for our youth.</p><span className="story-card__name">— IVC 2026 campaign</span></article>
            </div>
          </div>
        </section>

        <section id="faq" className="faq-section section-padding">
          <div className="faq-heading"><SectionLabel>Good to know</SectionLabel><h2>Questions, answered<br /><em>with care.</em></h2></div>
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
            <SectionLabel>Support our mission</SectionLabel>
            <h2>Already registered? <em>Help another family.</em></h2>
            <p>Donations are entirely optional and separate from registration. They help cover welfare, feeding, accommodation, learning materials and transportation so every participant can take part with dignity.</p>
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
          <SectionLabel><span className="label-dot label-dot--light" /> Registration is open</SectionLabel>
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
