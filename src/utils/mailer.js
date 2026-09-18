import nodemailer from "nodemailer";
import { config } from "../config/env.js";

let transporter = null;

export function getMailer() {
  if (transporter) return transporter;

  const host = (process.env.SMTP_HOST || config.smtpHost || "").trim();
  const port = parseInt(process.env.SMTP_PORT || config.smtpPort || "587", 10);
  const user = (process.env.SMTP_USER || config.smtpUser || "").trim();
  const rawPass = (process.env.SMTP_PASS || config.smtpPass || "").trim();
  // Strip all whitespace from app passwords (e.g. Gmail 16-char app passwords with spaces)
  const pass = rawPass.replace(/\s+/g, "");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (user && pass) {
    // If Gmail, using the built-in nodemailer 'gmail' service is most reliable
    if (host.includes("gmail") || user.endsWith("@gmail.com")) {
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: host || "smtp.gmail.com",
        port,
        secure,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: false,
        },
      });
    }
  } else {
    // Development fallback mock transport
    transporter = {
      sendMail: async (options) => {
        console.log("\n=======================================================");
        console.log(`[TRANSACTIONAL EMAIL - MOCK / DEV DISPATCH]`);
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
  const user = (process.env.SMTP_USER || config.smtpUser || "").trim();
  const from = (process.env.SMTP_FROM || config.smtpFrom || "").trim() || 
    (user ? `"ArchitectureNext" <${user}>` : '"ArchitectureNext" <noreply@architecturenext.in>');

  try {
    const mailer = getMailer();
    const info = await mailer.sendMail({
      from,
      to,
      subject,
      text: text || subject,
      html,
    });
    console.log(`[MAILER SUCCESS] Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[MAILER ERROR] Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

