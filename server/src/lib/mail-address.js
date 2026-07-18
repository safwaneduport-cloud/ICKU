/**
 * Where a notification for this person should actually go.
 *
 * `User.email` is the ACCOUNT IDENTITY — unique, drives the username — and is a
 * mix of domains (most staff were imported with a gmail address there). It is
 * NOT a reliable mailbox, so never mail it directly.
 *
 * Rule, set by the user 2026-07-17: the Eduport mailbox wins when there is one
 * (~14 staff); everyone else is reached on their Google address. Two people
 * currently have neither and receive nothing until HR fixes the source sheet.
 */
export const deliveryAddressFor = (user) => user?.eduportEmail || user?.googleEmail || null;

/** True when this person has a real Eduport mailbox — i.e. a Microsoft account. */
export const hasEduportMailbox = (user) => Boolean(user?.eduportEmail);

/** Prisma `select` for the fields the two helpers above read. */
export const MAIL_FIELDS = { id: true, name: true, eduportEmail: true, googleEmail: true };
