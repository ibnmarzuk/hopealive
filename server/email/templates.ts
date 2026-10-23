import { PAYMENT_DETAILS, type ClassGroup } from "@shared/registration";

/**
 * Registration confirmation email.
 *
 * Hand-written table-based HTML: email clients have no flexbox/grid support
 * worth relying on, and inline styles survive Gmail's style stripping. Colours
 * mirror the site palette in client/src/index.css (ink / cream / apricot).
 */

export type RegistrationEmailData = {
  studentName: string;
  registrationNumber: string;
  schoolClass: string;
  classGroup: ClassGroup | string;
  guardianPhone: string;
  appUrl: string;
  feeNgn?: number | null;
};

const INK = "#172c25";
const INK_SOFT = "#5f6e65";
const CREAM = "#f5f0e8";
const PAPER = "#fbfaf6";
const APRICOT = "#e7b58e";
const SAGE_LIGHT = "#e5ebe0";
const LINE = "#dcd8cf";

const CAMP = {
  dates: "23rd – 28th December, 2026",
  venue: "Ethical College, Ilorin",
  address: "Behind Okin Filling Station, Opposite Agric, Zango Road, Ilorin",
  accountName: PAYMENT_DETAILS.accountName,
  accountNumber: PAYMENT_DETAILS.accountNumber,
  bank: PAYMENT_DETAILS.bank,
  whatsappDisplay: PAYMENT_DETAILS.enquiriesPhone,
  whatsappLink: PAYMENT_DETAILS.enquiriesLink,
};

function formatNaira(amount: number | null | undefined): string {
  return typeof amount === "number" ? `₦${amount.toLocaleString("en-NG")}` : "Contact Hope-Alive to confirm the fee";
}

/** Escapes text interpolated into the HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function registrationEmailSubject(data: RegistrationEmailData): string {
  return `Registration saved — ${data.registrationNumber} · Hope-Alive IVC 2026`;
}

function detailRow(label: string, value: string, isLast = false): string {
  const border = isLast ? "" : `border-bottom:1px solid ${LINE};`;
  return `<tr>
    <td style="padding:12px 0;${border}font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${INK_SOFT};text-transform:uppercase;letter-spacing:0.08em;" valign="top">${escapeHtml(label)}</td>
    <td style="padding:12px 0;${border}font-family:Helvetica,Arial,sans-serif;font-size:15px;color:${INK};font-weight:700;text-align:right;" valign="top">${escapeHtml(value)}</td>
  </tr>`;
}

export function registrationEmailHtml(data: RegistrationEmailData): string {
  const name = escapeHtml(data.studentName);
  const number = escapeHtml(data.registrationNumber);
  const continueUrl = data.appUrl ? `${data.appUrl}/register?mode=continue` : "";

  const continueButton = continueUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
         <tr><td style="border-radius:999px;background:${INK};">
           <a href="${escapeHtml(continueUrl)}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${CREAM};text-decoration:none;border-radius:999px;">Continue my registration</a>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(registrationEmailSubject(data))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your registration number is ${number}. Keep it safe — you will need it for payment.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${PAPER};border-radius:16px;overflow:hidden;border:1px solid ${LINE};">

  <tr><td style="height:4px;background:${APRICOT};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:28px 32px 0;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.03em;color:${INK};">hope-alive</p>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${INK_SOFT};">Islamic Vacation Course 2026</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;letter-spacing:-0.04em;line-height:1.1;color:${INK};">You're registered, ${name}.</h1>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK_SOFT};">Your place at the IVC 2026 camping programme is saved. Keep the registration number below — you'll need it to make payment and to pick up where you left off.</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAGE_LIGHT};border-radius:12px;">
      <tr><td align="center" style="padding:20px;">
        <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${INK_SOFT};">Your registration number</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:28px;font-weight:800;letter-spacing:0.06em;color:${INK};">${number}</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:20px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${detailRow("Participant", data.studentName)}
      ${detailRow("Class", data.schoolClass)}
      ${detailRow("Class group", String(data.classGroup))}
      ${detailRow("Registration fee", formatNaira(data.feeNgn))}
      ${detailRow("Contact phone", data.guardianPhone)}
      ${detailRow("Dates", CAMP.dates)}
      ${detailRow("Venue", CAMP.venue, true)}
    </table>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">${escapeHtml(CAMP.address)}</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${INK_SOFT};">Next step — payment</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 2px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${INK};">${escapeHtml(CAMP.accountName)}</p>
        <p style="margin:0 0 2px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.06em;color:${INK};">${escapeHtml(CAMP.accountNumber)}</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK_SOFT};">${escapeHtml(CAMP.bank)}</p>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">Pay by transfer using the details above, then come back to the site and upload a screenshot of your receipt. Our team reviews payments manually; once yours is confirmed, you’ll receive the participants’ group link.</p>
  </td></tr>

  ${continueButton ? `<tr><td align="center" style="padding:26px 32px 0;">${continueButton}</td></tr>` : ""}

  <tr><td style="padding:28px 32px 28px;">
    <div style="height:1px;background:${LINE};margin-bottom:16px;"></div>
    <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SOFT};">Questions? Message us on WhatsApp at <a href="${CAMP.whatsappLink}" style="color:${INK};">${escapeHtml(CAMP.whatsappDisplay)}</a>.</p>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${INK_SOFT};">You received this because this address was used to register a participant for the Hope-Alive Islamic Vacation Course 2026. This is a one-off confirmation, not a marketing list.</p>
    <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">Hope-Alive Muslim Foundation · Faith · Education · Community</p>
  </td></tr>

</table>
<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">&copy; 2026 Hope-Alive Muslim Foundation</p>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative. Improves deliverability and serves text-only clients. */
export function registrationEmailText(data: RegistrationEmailData): string {
  const lines = [
    `You're registered, ${data.studentName}.`,
    "",
    "Your place at the Hope-Alive Islamic Vacation Course 2026 camping programme is saved.",
    "",
    `YOUR REGISTRATION NUMBER: ${data.registrationNumber}`,
    "Keep this number — you need it for payment and to continue later.",
    "",
    `Participant:   ${data.studentName}`,
    `Class:         ${data.schoolClass}`,
    `Class group:   ${data.classGroup}`,
    `Registration fee: ${formatNaira(data.feeNgn)}`,
    `Contact phone: ${data.guardianPhone}`,
    `Dates:         ${CAMP.dates}`,
    `Venue:         ${CAMP.venue}`,
    `               ${CAMP.address}`,
    "",
    "NEXT STEP — PAYMENT",
    `${CAMP.accountName}`,
    `${CAMP.accountNumber}`,
    `${CAMP.bank}`,
    "",
    "Pay by transfer using the details above, then come back to the site and upload a screenshot of your receipt. Our team reviews payments manually; once yours is confirmed, you'll receive the participants' group link.",
  ];

  if (data.appUrl) {
    lines.push("", `Upload your receipt / continue: ${data.appUrl}/register?mode=continue`);
  }

  lines.push(
    "",
    "---",
    `Questions? WhatsApp ${CAMP.whatsappDisplay}.`,
    "You received this because this address was used to register a participant for the Hope-Alive Islamic Vacation Course 2026. This is a one-off confirmation, not a marketing list.",
    "Hope-Alive Muslim Foundation · Faith · Education · Community",
  );

  return lines.join("\n");
}

/* ------------------------------------------------------------------------ */
/* Payment confirmed                                                         */
/* ------------------------------------------------------------------------ */

export type PaymentVerifiedEmailData = {
  studentName: string;
  registrationNumber: string;
  classGroup: ClassGroup | string;
  feeNgn?: number | null;
  /** Group invite link. Omitted from the email when not configured. */
  groupUrl: string;
  appUrl: string;
};

export function paymentVerifiedEmailSubject(data: PaymentVerifiedEmailData): string {
  return `Payment confirmed — ${data.registrationNumber} · Hope-Alive IVC 2026`;
}

export function paymentVerifiedEmailHtml(data: PaymentVerifiedEmailData): string {
  const name = escapeHtml(data.studentName);
  const number = escapeHtml(data.registrationNumber);
  const groupUrl = data.groupUrl ? escapeHtml(data.groupUrl) : "";

  const groupBlock = groupUrl
    ? `<tr><td style="padding:24px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAGE_LIGHT};border-radius:12px;">
          <tr><td align="center" style="padding:22px 20px;">
            <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${INK_SOFT};">Participants' WhatsApp group</p>
            <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">This link is for verified participants only. Please don't forward it.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td style="border-radius:999px;background:${INK};">
                <a href="${groupUrl}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${CREAM};text-decoration:none;border-radius:999px;">Join the group</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`
    : `<tr><td style="padding:24px 32px 0;">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${INK_SOFT};">We'll share the participants' group link with verified families shortly — keep an eye on this inbox.</p>
      </td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(paymentVerifiedEmailSubject(data))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Payment confirmed for ${number}. ${name}'s place at IVC 2026 is secured.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${PAPER};border-radius:16px;overflow:hidden;border:1px solid ${LINE};">

  <tr><td style="height:4px;background:${APRICOT};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:28px 32px 0;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.03em;color:${INK};">hope-alive</p>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${INK_SOFT};">Islamic Vacation Course 2026</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;letter-spacing:-0.04em;line-height:1.1;color:${INK};">Payment confirmed.</h1>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK_SOFT};">Thank you — ${name}'s place at the IVC 2026 camping programme is secured under <strong style="color:${INK};">${number}</strong> (${escapeHtml(String(data.classGroup))}).</p>
  </td></tr>

  ${groupBlock}

  <tr><td style="padding:24px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${detailRow("Registration fee", formatNaira(data.feeNgn))}
      ${detailRow("Dates", CAMP.dates)}
      ${detailRow("Venue", CAMP.venue, true)}
    </table>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">${escapeHtml(CAMP.address)}</p>
  </td></tr>

  <tr><td style="padding:28px 32px 28px;">
    <div style="height:1px;background:${LINE};margin-bottom:16px;"></div>
    <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SOFT};">Questions? Message us on WhatsApp at <a href="${CAMP.whatsappLink}" style="color:${INK};">${escapeHtml(CAMP.whatsappDisplay)}</a>.</p>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${INK_SOFT};">You received this because a payment was confirmed for a Hope-Alive IVC 2026 registration made with this address. This is a one-off confirmation, not a marketing list.</p>
    <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">Hope-Alive Muslim Foundation · Faith · Education · Community</p>
  </td></tr>

</table>
<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">&copy; 2026 Hope-Alive Muslim Foundation</p>
</td></tr>
</table>
</body>
</html>`;
}

export function paymentVerifiedEmailText(data: PaymentVerifiedEmailData): string {
  const lines = [
    "Payment confirmed.",
    "",
    `Thank you — ${data.studentName}'s place at the Hope-Alive IVC 2026 camping programme is secured under ${data.registrationNumber} (${data.classGroup}).`,
    `Registration fee: ${formatNaira(data.feeNgn)}`,
    "",
  ];

  if (data.groupUrl) {
    lines.push(
      "PARTICIPANTS' WHATSAPP GROUP",
      "This link is for verified participants only. Please don't forward it.",
      data.groupUrl,
    );
  } else {
    lines.push("We'll share the participants' group link with verified families shortly — keep an eye on this inbox.");
  }

  lines.push(
    "",
    `Dates: ${CAMP.dates}`,
    `Venue: ${CAMP.venue}`,
    `       ${CAMP.address}`,
    "",
    "---",
    `Questions? WhatsApp ${CAMP.whatsappDisplay}.`,
    "You received this because a payment was confirmed for a Hope-Alive IVC 2026 registration made with this address. This is a one-off confirmation, not a marketing list.",
    "Hope-Alive Muslim Foundation · Faith · Education · Community",
  );

  return lines.join("\n");
}
