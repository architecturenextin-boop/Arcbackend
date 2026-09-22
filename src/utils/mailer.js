import nodemailer from "nodemailer";
import { config } from "../config/env.js";

let transporter = null;

export function getMailer() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || config.smtpHost;
  const port = parseInt(process.env.SMTP_PORT || config.smtpPort || "587", 10);
  const user = process.env.SMTP_USER || config.smtpUser;
  const pass = process.env.SMTP_PASS || config.smtpPass;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });
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
  const from = process.env.SMTP_FROM || '"ArchitectureNext" <noreply@architecturenext.in>';
  try {
    const mailer = getMailer();
    const info = await mailer.sendMail({
      from,
      to,
      subject,
      text: text || subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[MAILER ERROR] Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}
