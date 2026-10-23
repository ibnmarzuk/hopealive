import { useState } from "react";
import { ArrowUpRight, HeartHandshake, X } from "lucide-react";

const DISMISS_KEY = "hopealive:donation-bar-dismissed";

/**
 * Secondary support strip shown above the header.
 *
 * Deliberately low contrast and low visual weight: registration is the site's
 * primary action, so this bar must read as a supporting utility strip rather
 * than a competing call to action. It is static (never fixed), so it scrolls
 * away and can't obstruct the mobile nav or the registration form, and it can
 * be dismissed for good.
 */
export default function DonationBar() {
  const [visible, setVisible] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) !== "1";
    } catch {
      // Private browsing / storage blocked — show the bar rather than fail.
      return true;
    }
  });

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Dismissal just won't persist. */
    }
  };

  return (
    <aside className="donation-bar" aria-label="Support the Islamic Vacation Course">
      <p className="donation-bar__message">
        <HeartHandshake size={14} aria-hidden="true" />
        <span>
          <strong>IVC 2026 runs on community support.</strong>
          <span className="donation-bar__detail"> Donations cover welfare, feeding and accommodation.</span>
        </span>
      </p>
      <a className="donation-bar__link" href="#support">
        Donate <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <button className="donation-bar__dismiss" type="button" onClick={dismiss} aria-label="Dismiss support message">
        <X size={14} aria-hidden="true" />
      </button>
    </aside>
  );
}
