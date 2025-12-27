// Shared HTML email template for Split Smart

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSplitSmartEmail({
  title,
  subtitle,
  greeting,
  intro,
  highlightLabel,
  highlightValue,
  bodyLines = [],
  ctaLabel,
  ctaUrl,
  footerText,
}) {
  const safeTitle = escapeHtml(title || "");
  const safeSubtitle = escapeHtml(subtitle || "");
  const safeGreeting = escapeHtml(greeting || "Hi there,");
  const safeIntro = escapeHtml(intro || "");
  const safeHighlightLabel = escapeHtml(highlightLabel || "");
  const safeHighlightValue = escapeHtml(highlightValue || "");
  const safeFooter = escapeHtml(
    footerText ||
      "You're receiving this email because of activity in your Split Smart account."
  );

  const bodyHtml = (bodyLines || [])
    .map((line) => `<p style=\"margin:4px 0;color:#CBD5F5;font-size:14px;\">${escapeHtml(line)}</p>`)
    .join("");

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<a href=\"${ctaUrl}\" style=\"display:inline-block;padding:10px 22px;border-radius:999px;background:linear-gradient(135deg,#38bdf8,#6366f1);color:#0b1120;font-weight:600;font-size:14px;text-decoration:none;margin-top:12px;\">${escapeHtml(
          ctaLabel
        )}</a>`
      : "";

  const highlightHtml =
    safeHighlightLabel || safeHighlightValue
      ? `<div style=\"margin-top:20px;padding:14px 18px;border-radius:14px;background:linear-gradient(135deg,rgba(56,189,248,0.18),rgba(129,140,248,0.22));border:1px solid rgba(148,163,184,0.35);\">
  <div style=\"font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#93c5fd;margin-bottom:4px;\">${safeHighlightLabel}</div>
  <div style=\"font-size:16px;font-weight:600;color:#e5e7eb;\">${safeHighlightValue}</div>
</div>`
      : "";

  return `<!DOCTYPE html>
<html lang=\"en\">
  <head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>Split Smart</title>
  </head>
  <body style=\"margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;\">
    <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" width=\"100%\" style=\"background:#020617;padding:24px 0;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" width=\"100%\" style=\"max-width:640px;background:radial-gradient(circle at top left,#1e293b 0,#020617 55%);border-radius:24px;padding:28px 24px 26px;border:1px solid rgba(148,163,184,0.45);box-shadow:0 18px 45px rgba(15,23,42,0.9);\">
            <tr>
              <td style=\"padding-bottom:6px;\">
                <div style=\"font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#38bdf8;font-weight:600;\">Split Smart</div>
                <div style=\"margin-top:6px;display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a5b4fc;background:rgba(15,23,42,0.8);\">${safeSubtitle}</div>
              </td>
            </tr>
            <tr>
              <td style=\"padding-top:6px;\">
                <h1 style=\"margin:6px 0 4px;font-size:22px;line-height:1.3;color:#e5e7eb;\">${safeTitle}</h1>
                <p style=\"margin:0 0 10px;color:#93c5fd;font-size:14px;\">${safeGreeting}</p>
                <p style=\"margin:0 0 12px;color:#cbd5f5;font-size:14px;\">${safeIntro}</p>
                ${highlightHtml}
                <div style=\"margin-top:14px;\">
                  ${bodyHtml}
                  ${ctaHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style=\"padding-top:18px;border-top:1px solid rgba(30,64,175,0.7);margin-top:18px;\">
                <p style=\"margin:10px 0 0;font-size:11px;color:#64748b;\">${safeFooter}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { buildSplitSmartEmail };
