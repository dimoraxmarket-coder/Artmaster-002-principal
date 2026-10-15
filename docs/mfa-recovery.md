# Controlled MFA recovery — procedure, not an authentication bypass

This runbook is a design for an authorized operator, not an executable self-service reset. No recovery endpoint, password-only administrative session or static emergency password is introduced. Do not perform these steps on an external service without owner approval. Rehearse first using synthetic staging accounts.

## Preparation

Maintain two independently secured provider/organization owners with their own MFA/recovery mechanisms and least-privilege access. Keep an offline, access-controlled identity-verification and incident contact process. Store provider recovery material using the provider's supported mechanisms in separate secure custody. Do not copy TOTP seeds into Git, issue bodies, support tickets or shared chat. Do not assume native application recovery codes exist: they are not implemented here.

Record a protected recovery case ID, account UUID, reason, verification method, two independent approvers, timestamps and operator actions. Do not store passwords, seeds, QR images, OTPs, bearer tokens, session cookies or unnecessary client details. A password, email response, phone call or support request alone is insufficient identity proof. Use the organization's pre-established out-of-band verification procedure; if identity or ownership is uncertain, keep the account locked and escalate.

## Recovery sequence

1. Verify identity through that procedure and obtain two independent authorizations. A reviewer must not approve their own recovery. Confirm the exact project and user UUID; check that it is the intended environment, not a similarly named project.
2. Quarantine the account's administrative role under the approved change procedure, preserving its prior value in the protected recovery record. The application re-reads roles on every request; removing the role blocks new logins and existing data access. Revoke all of the account's application full and pending session rows, and revoke provider refresh sessions using supported Supabase administrative mechanisms. Do not touch customer enquiries, attachments or media.
3. Reproduce denial of existing cookies and signed AAL2 direct reads. Investigate indicators of compromise before restoring access. An in-flight request already authorized before revocation may complete; for an incident requiring an immediate hard stop, use an explicitly approved maintenance/access restriction. Do not claim instantaneous cancellation of in-flight operations.
4. Only an approved owner/operator with independently verified MFA may remove the lost factor using supported Supabase dashboard/Auth Admin mechanisms. Do not use an unverified application session to unenroll it. If the installed provider/version cannot securely perform the required revocation/reset, stop and obtain provider support. Never turn off the application's AAL2/RLS gates.
5. If password compromise is suspected, reset the password through the supported provider flow as well. Use secure delivery and account-owner confirmation; no password values in tickets or logs. This is not proof of MFA completion.
6. Restore only the previously approved least-privilege role when ready for supervised re-enrollment. Old application session rows must stay revoked. Password login now reaches only the five-minute enrollment gate; it cannot read customer data, media previews, CMS or protected direct SQL. If the user cannot enroll immediately, keep the account quarantined.
7. The owner enrolls and verifies a new TOTP factor. Verify the resulting AAL2 session, role restrictions, denial of all old cookies/tokens and pending-session replay. Revoke any temporary sessions. The operator never collects or stores the new seed/code.
8. Close the protected case only after the second approver checks the recorded evidence. Notify the owner over the established independent channel and review audit/security events without exposing customer data. Restore service only within the existing authorized rollout process.

Removing a role is a targeted, separately approved access change. Production execution is outside this coding task. An implementation for automation would require its own permissions, approvals, audit durability and integration tests; do not paste ad-hoc service-role scripts into a support request.

## Staging rehearsal and acceptance

Use a synthetic account and record only pass/fail/case references. Demonstrate quarantine and revocation before factor reset; password-only login has no data access; new enrollment grants AAL2 with the original role; old application and provider tokens remain unable to read protected rows; incomplete, expired or cancelled recovery remains locked. Also rehearse the failure case where both provider owners lose access: use the provider's documented organization-recovery process, not an application backdoor.

Offline tests cover role removal, revoked/expired full and pending sessions, AAL2, session-bound RLS and re-enrollment restrictions. They cannot validate a person's identity, provider-owner MFA, actual factor reset or operational dual control. These remain required real staging checks.

## Phase 5 controls

A freshly authenticated administrator can now suspend a **different** managed account through Team Management. This preserves its role and customer records, increments its security version, revokes full/pending ARTMASTER sessions and writes a security audit event in one transaction. The last enabled administrator and self changes are protected. The application's current-session listing and factor status do not replace provider-owner verification or revoke every provider-wide refresh session.

Recovery still requires the independent dual-approval procedure above. Use the reviewed suspension control for quarantine when applicable; provider factor removal, provider-wide revocation and supervised re-enrollment remain authorized owner operations. Enabling an account afterward never restores its old application cookies. Do not remove the last secured administrator, alter audit evidence or bypass the enrollment/AAL2 gate. See [the Phase 5 staging matrix](security-center.md) before any hosted rehearsal.
