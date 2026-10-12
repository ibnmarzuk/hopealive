import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Facebook,
  HeartHandshake,
  Instagram,
  MapPin,
  Menu,
  Phone,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

const heroImage = "/manus-storage/async-images/VgH3TwUkq1PXoZLmNXCcSY/image-1.webp";

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

const faqs = [
  {
    question: "Who is the programme for?",
    answer:
      "The IVC 2026 camping programme is for Muslim children, students, workers and parents. It is a community programme designed to nurture young hearts while bringing every generation together.",
  },
  {
    question: "What does my donation support?",
    answer:
      "Donations help cover welfare, feeding, accommodation, learning materials, transportation and other camp needs so every participant can have a safe, enriching and impactful experience.",
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
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const closeMenu = () => setMenuOpen(false);
  const openRegistration = () => {
    setRegistrationOpen(true);
    setSubmitted(false);
    closeMenu();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    toast.success("Your support request is on its way.", {
      description: "We’ll be in touch with the IVC 2026 support details shortly.",
    });
  };

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText("0019871510");
      toast.success("Account number copied.");
    } catch {
      toast.error("Could not copy the account number. Please select it and copy manually.");
    }
  };

  return (
    <div className="site-shell">
      <div className="announcement-bar">
        <span>Fundraising for IVC 2026 is now open</span>
        <a href="#support">Support the mission <ArrowUpRight size={14} /></a>
      </div>

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
          <a href="#programme" onClick={closeMenu}>The programme</a>
          <a href="#details" onClick={closeMenu}>Camp details</a>
          <a href="#support" onClick={closeMenu}>Support the mission</a>
          <a className="nav-cta nav-cta--mobile" href="/register">Register now <ArrowUpRight size={16} /></a>
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
            <h1>Help make a meaningful camp <em>possible.</em></h1>
            <p className="hero-lede">Hope-Alive Muslim Foundation is raising support for a camping programme that nurtures young hearts with the light of Islam, builds character and creates lasting memories.</p>
            <div className="hero-actions">
              <a className="button button--ink" href="/register">Register a participant <ArrowUpRight size={18} /></a>
              <a className="text-link" href="/register?mode=continue">Continue registration <span>↘</span></a>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack" aria-hidden="true">
                <span>AM</span><span>ZA</span><span>RK</span><span>+</span>
              </div>
              <p><strong>Faith · Education · Community</strong><br />A brighter future for our youth.</p>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-image-wrap">
              <img src={heroImage} alt="Young learners gathering around a table in a bright classroom" className="hero-image" />
              <div className="hero-image-wash" />
            </div>
            <div className="hero-sticker hero-sticker--top">learn <span>with</span> heart</div>
            <div className="hero-info-card">
              <div className="hero-info-card__top"><span>Camping programme</span><span className="status-pill"><i /> Support open</span></div>
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
          <div><span className="signal-icon"><HeartHandshake size={17} /></span><span><strong>Give with purpose</strong><small>help make the camp meaningful</small></span></div>
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
              <p>Your donation helps provide welfare, feeding, accommodation, learning materials, transportation and other camp needs for every participant.</p>
            </div>
            <a href="#support" className="circle-link">Make a difference <ArrowUpRight size={19} /></a>
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
          <div className="programme-note"><span className="note-line" /><p><strong>Our promise:</strong> every contribution helps make this meaningful programme a success.</p><a href="#support">See what your gift supports <ArrowUpRight size={16} /></a></div>
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
            <p>Help us provide a safe, enriching and impactful experience for every participant at this year’s Islamic Vacation Course.</p>
            <a className="button button--outline" href="/register">Register a participant <ArrowUpRight size={18} /></a>
          </div>
          <div className="details-list">
            <div className="detail-row"><span className="detail-icon"><CalendarDays size={19} /></span><div><span className="detail-label">Date</span><strong>23rd–28th December, 2026</strong><p>Six days of camping, learning and community</p></div></div>
            <div className="detail-row"><span className="detail-icon"><MapPin size={19} /></span><div><span className="detail-label">Venue</span><strong>Ethical College, Ilorin</strong><p>Behind Okin Filling Station, Opposite Agric, Zango Road, Ilorin</p></div></div>
            <div className="detail-row"><span className="detail-icon"><Users size={19} /></span><div><span className="detail-label">Categories</span><strong>Muslim children, students, workers and parents</strong><p>A community programme for every generation</p></div></div>
            <div className="detail-row"><span className="detail-icon"><Clock3 size={19} /></span><div><span className="detail-label">Fundraising goal</span><strong>Welfare, feeding and accommodation</strong><p>Learning materials, transportation and other camp needs</p></div></div>
          </div>
        </section>

        <section id="support" className="support-section section-padding">
          <div className="support-copy">
            <SectionLabel>Support our mission</SectionLabel>
            <h2>Your gift can turn a good idea into a <em>life-changing week.</em></h2>
            <p>We are raising funds to cover key aspects of the camp so that every participant can experience the programme with dignity, safety and joy.</p>
            <div className="support-needs">
              <span><Check size={15} /> Welfare</span><span><Check size={15} /> Feeding</span><span><Check size={15} /> Accommodation</span><span><Check size={15} /> Learning materials</span><span><Check size={15} /> Transportation</span><span><Check size={15} /> Other camp needs</span>
            </div>
            <a className="whatsapp-link" href="https://wa.me/2348057782932" target="_blank" rel="noreferrer"><span>WA</span> Enquiries & support: <strong>08057782932</strong> <ArrowUpRight size={16} /></a>
          </div>
          <div className="support-panel">
            <div className="account-card"><span className="detail-label">Account details</span><strong>Hope-alive Muslim Found.</strong><div className="account-number-row"><span className="account-number">0019871510</span><button className="copy-account-button" type="button" aria-label="Copy account number" title="Copy account number" onClick={copyAccountNumber}><Copy size={16} /></button></div><span>Jaiz Bank</span><button className="button button--cream" onClick={openRegistration}>I want to support <ArrowUpRight size={17} /></button></div>
          </div>
        </section>

        <section id="stories" className="stories-section section-padding">
          <div className="stories-topline"><SectionLabel>Make a difference</SectionLabel><span>02<span>/03</span></span></div>
          <div className="stories-layout">
            <div className="stories-copy"><h2>The moments that<br /><em>stay with you.</em></h2><p>We measure a good camp in stronger character, deeper faith, new friendships and memories that keep giving long after the tents come down.</p><a href="#support" className="text-link">Help make it possible <span>↘</span></a></div>
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

        <section className="final-cta section-padding">
          <div className="final-cta__shape final-cta__shape--one" />
          <div className="final-cta__shape final-cta__shape--two" />
          <SectionLabel><span className="label-dot label-dot--light" /> Make a difference</SectionLabel>
          <h2>Give them a week<br /><em>they’ll carry forward.</em></h2>
          <p>Support the IVC 2026 camping programme and help Hope-Alive nurture young hearts with faith, education and community.</p>
          <a className="button button--cream" href="/register">Register now <ArrowUpRight size={18} /></a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><a href="#top" className="wordmark wordmark--footer"><Mark compact /><span><strong>hope-alive</strong><small>Muslim foundation</small></span></a><p>Faith · Education · Community<br />Together, we can build a brighter future.</p></div>
        <div className="footer-links"><div><span>Explore</span><a href="#why">About IVC 2026</a><a href="#programme">The programme</a><a href="#details">Camp details</a><a href="#support">Support the mission</a></div><div><span>Connect</span><a href="https://wa.me/2348057782932" target="_blank" rel="noreferrer"><Phone size={14} /> 08057782932</a><a href="#support"><BookOpen size={14} /> Jaiz Bank · 0019871510</a><div className="social-links"><a href="#top" aria-label="Instagram"><Instagram size={17} /></a><a href="#top" aria-label="Facebook"><Facebook size={17} /></a></div></div></div>
        <div className="footer-bottom"><span>© 2026 Hope-Alive</span><span>Made with intention.</span><a href="#top">Back to top ↑</a></div>
      </footer>

      {registrationOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setRegistrationOpen(false); }}>
        <div className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title">
          <button className="modal-close" onClick={() => setRegistrationOpen(false)} aria-label="Close registration form"><X size={20} /></button>
          {!submitted ? <>
            <SectionLabel>Support IVC 2026</SectionLabel>
            <h2 id="registration-title">Start with a<br /><em>simple hello.</em></h2>
            <p className="modal-intro">Tell us a little about yourself and we’ll send the IVC 2026 support pack, donation details and next steps.</p>
            <form onSubmit={handleSubmit} className="registration-form">
              <label>Your name<input required name="name" placeholder="Your name" /></label>
              <label>Email address<input required type="email" name="email" placeholder="you@example.com" /></label>
              <label>How would you like to help?<input required name="support" placeholder="Donation, volunteering, materials…" /></label>
              <label className="form-check"><input required type="checkbox" /> <span>I’m happy to receive the IVC 2026 support pack by email.</span></label>
              <button className="button button--ink button--full" type="submit">Send my request <ArrowUpRight size={18} /></button>
            </form>
          </> : <div className="success-state"><span className="success-icon"><Check size={26} /></span><SectionLabel>Thank you</SectionLabel><h2>You’re on the<br /><em>right list.</em></h2><p>We’ve received your request. Keep an eye on your inbox for the IVC 2026 support pack and next steps.</p><button className="button button--outline button--full" onClick={() => setRegistrationOpen(false)}>Close this window</button></div>}
        </div>
      </div>}
    </div>
  );
}
