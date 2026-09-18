import { sendEmail } from "../src/utils/mailer.js";

async function run() {
  console.log("Sending real test email via sendEmail()...");
  const result = await sendEmail({
    to: "architecturenextin@gmail.com",
    subject: "Test Email from ArchitectureNext Backend Live Check",
    html: "<h1>ArchitectureNext Email Test</h1><p>Your SMTP Gmail credentials are working successfully!</p>",
    text: "Your SMTP Gmail credentials are working successfully!",
  });
  console.log("SendEmail Result:", result);
}

run();
