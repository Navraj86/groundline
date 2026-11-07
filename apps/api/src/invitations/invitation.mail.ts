import { html } from '@nestjs/mail';
import { ROLE_LABELS, type OrgRole } from '@groundline/shared';

export interface InvitationMailData {
  organizationName: string;
  inviterName: string;
  role: OrgRole;
  acceptUrl: string;
  expiresAt: Date;
}

export function invitationMail(data: InvitationMailData) {
  const role = ROLE_LABELS[data.role];
  const expires = data.expiresAt.toUTCString().replace(/:\d\d GMT$/, ' UTC');
  return {
    subject: `${data.inviterName} invited you to ${data.organizationName} on Groundline`,
    html: html`
      <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 520px; color: #111827">
        <h2 style="margin: 0 0 16px">Join ${data.organizationName} on Groundline</h2>
        <p>${data.inviterName} invited you to join <strong>${data.organizationName}</strong> as <strong>${role}</strong>.</p>
        <p style="margin: 24px 0">
          <a href="${data.acceptUrl}"
             style="background: #111827; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none">
            Accept invitation
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px">
          This invitation expires on ${expires}. If you weren't expecting it, you can ignore this email.
        </p>
      </div>
    `,
  };
}
