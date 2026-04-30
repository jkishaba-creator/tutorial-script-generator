/**
 * Discord Webhook Utility
 * Sends formatted messages to a Discord channel via webhook.
 */

export async function sendDiscordNotification(title: string, message: string, color: number = 0x00FF00) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("DISCORD_WEBHOOK_URL is not set. Skipping Discord notification.");
    return;
  }

  try {
    const payload = {
      embeds: [
        {
          title,
          description: message,
          color,
          timestamp: new Date().toISOString(),
          footer: {
            text: "Factory Floor Conveyor Belt"
          }
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Failed to send Discord webhook: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("Error sending Discord webhook:", err);
  }
}
