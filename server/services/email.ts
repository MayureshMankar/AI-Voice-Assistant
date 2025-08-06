export interface EmailData {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  attachments?: string[];
}

export interface EmailProvider {
  name: string;
  sendEmail(data: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Gmail API Provider (requires OAuth setup)
export class GmailProvider implements EmailProvider {
  name = 'gmail';
  private accessToken: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.GMAIL_ACCESS_TOKEN || '';
  }

  async sendEmail(data: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.accessToken) {
        return {
          success: false,
          error: 'Gmail access token not configured. Please set up OAuth authentication.'
        };
      }

      // In a real implementation, this would use the Gmail API
      // For now, return a demo response
      console.log('Email would be sent via Gmail API:', data);
      
      return {
        success: true,
        messageId: `gmail_${Date.now()}`,
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}

// SendGrid Provider
export class SendGridProvider implements EmailProvider {
  name = 'sendgrid';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SENDGRID_API_KEY || '';
  }

  async sendEmail(data: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'SendGrid API key not configured'
        };
      }

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: data.to }],
            cc: data.cc?.map(email => ({ email })),
            bcc: data.bcc?.map(email => ({ email })),
            subject: data.subject
          }],
          from: { email: process.env.FROM_EMAIL || 'assistant@yourapp.com' },
          content: [{
            type: 'text/plain',
            value: data.body
          }]
        }),
      });

      if (response.ok) {
        return {
          success: true,
          messageId: response.headers.get('x-message-id') || undefined
        };
      } else {
        const error = await response.text();
        return {
          success: false,
          error: `SendGrid error: ${error}`
        };
      }

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}

// Email Service Manager
export class EmailService {
  private providers: Map<string, EmailProvider> = new Map();
  private defaultProvider = 'demo';

  constructor() {
    this.providers.set('gmail', new GmailProvider());
    this.providers.set('sendgrid', new SendGridProvider());
  }

  async sendEmail(
    data: EmailData,
    provider: string = this.defaultProvider
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const emailProvider = this.providers.get(provider);
    
    if (!emailProvider) {
      return {
        success: false,
        error: `Email provider '${provider}' not found`
      };
    }

    try {
      return await emailProvider.sendEmail(data);
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  parseEmailFromText(text: string): EmailData | null {
    try {
      const lowerText = text.toLowerCase();
      
      // Extract email address
      const emailMatch = text.match(/(?:to|send to|email)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (!emailMatch) {
        return null;
      }

      const to = emailMatch[1];

      // Extract subject (look for "subject" keyword or infer from content)
      let subject = 'Message from Voice Assistant';
      const subjectMatch = text.match(/(?:subject|about|regarding)\s+[":']?([^"']+)[":']?/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
      }

      // Extract body (everything else or look for specific body markers)
      let body = text
        .replace(/(?:send|email|to)\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, '')
        .replace(/(?:subject|about|regarding)\s+[":']?[^"']+[":']?/i, '')
        .trim();

      if (!body) {
        body = 'This message was sent via voice assistant.';
      }

      return {
        to,
        subject,
        body
      };

    } catch (error) {
      console.error('Error parsing email from text:', error);
      return null;
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const emailService = new EmailService();