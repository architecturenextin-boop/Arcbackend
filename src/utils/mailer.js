import nodemailer from "nodemailer";
import { config } from "../config/env.js";

let transporter = null;

export function getMailer(forceNew = false) {
  if (transporter && !forceNew) return transporter;

  const host = process.env.SMTP_HOST || config.smtpHost || "";
  const port = parseInt(process.env.SMTP_PORT || config.smtpPort || "587", 10);
  const user = process.env.SMTP_USER || config.smtpUser;
  const pass = process.env.SMTP_PASS || config.smtpPass;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (user && pass) {
    const isGmail = host.toLowerCase().includes("gmail") || user.toLowerCase().includes("@gmail.com");

    const transportOpts = isGmail
      ? {
          service: "gmail",
          auth: { user, pass },
          pool: false, // Prevents stale pooled connection timeouts with Gmail SMTP
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        }
      : {
          host,
          port,
          secure,
          auth: { user, pass },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          tls: {
            rejectUnauthorized: process.env.NODE_ENV === "production",
          },
        };

    transporter = nodemailer.createTransport(transportOpts);
  } else {
    // Development fallback mock transport
    transporter = {
      sendMail: async (options) => {
        console.log("\n=======================================================");
        console.log("[TRANSACTIONAL EMAIL - MOCK / DEV DISPATCH]");
        console.log(`To:      ${options.to}`);
        console.log(`From:    ${options.from || "noreply@architecturenext.in"}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`Preview: ${options.text || "(HTML body sent)"}`);
        console.log("=======================================================\n");
        return { messageId: `mock-${Date.now()}` };
      },
    };
  }

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const user = process.env.SMTP_USER || config.smtpUser;
  const from = process.env.SMTP_FROM || (user ? `"ArchitectureNext" <${user}>` : '"ArchitectureNext" <noreply@architecturenext.in>');
  
  // First attempt
  try {
    const mailer = getMailer();
    const info = await mailer.sendMail({
      from,
      to,
      subject,
      text: text || subject,
      html,
    });
    console.log(`[MAILER SUCCESS] Email sent to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (firstError) {
    console.warn(`[MAILER WARNING] First send attempt failed for ${to}: ${firstError.message}. Retrying with fresh connection...`);
    
    // Invalidate cached transporter and retry once with fresh connection
    try {
      const freshMailer = getMailer(true);
      const retryInfo = await freshMailer.sendMail({
        from,
        to,
        subject,
        text: text || subject,
        html,
      });
      console.log(`[MAILER SUCCESS] Email sent to ${to} on retry (MessageId: ${retryInfo.messageId})`);
      return { success: true, messageId: retryInfo.messageId };
    } catch (retryError) {
      console.error(`[MAILER ERROR] Failed to send email to ${to} after retry:`, retryError.message);
      return { success: false, error: retryError.message };
    }
  }
}
