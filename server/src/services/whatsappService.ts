import { Contact, MessageKind, WhatsappChannel } from "../types.js";

export class WhatsappService {
  async sendMessage(input: {
    channel: WhatsappChannel;
    contact: Contact;
    body: string;
    kind: MessageKind;
  }) {
    const shouldCallMeta =
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_API_VERSION &&
      input.channel.phoneNumberId !== "meta-phone-number-id-demo";

    if (!shouldCallMeta) {
      return {
        delivered: false,
        provider: "mock",
        payload: input
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${input.channel.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.contact.phone,
          type: "text",
          text: { body: input.body }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} ${errorText}`);
    }

    return {
      delivered: true,
      provider: "meta",
      payload: await response.json()
    };
  }
}
