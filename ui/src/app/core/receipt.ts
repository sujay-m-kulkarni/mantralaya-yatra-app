import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

import { formatDay } from './dates';
import { formatInr } from './money';
import { Booking, Payment } from './models';

/** The receipt text sent to the devotee on WhatsApp. */
export function receiptText(yatraName: string, sevaName: string, booking: Booking, payments: Payment[], pendingPaise: number): string {
  const s = booking.sankalpa;
  const paid = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const modes = [...new Set(payments.map((p) => p.mode.toUpperCase()))].join(' + ');
  const lines = [
    `🙏 *${yatraName}*`,
    `Seva receipt *${booking.receiptNo ?? booking.draftReceiptNo}*${booking.receiptNo ? '' : ' (provisional)'}`,
    '',
    `Seva: ${sevaName}`,
    `Date: ${formatDay(booking.sevaDate)}`,
    `Devotee: ${booking.devoteeName}`,
  ];
  if (s?.onBehalfOf) lines.push(`On behalf of: ${s.onBehalfOf}`);
  const sankalpa = [s?.gotra && `${s.gotra} gotra`, s?.nakshatra && `${s.nakshatra} nakshatra`, s?.rashi && `${s.rashi} rashi`]
    .filter(Boolean)
    .join(', ');
  if (sankalpa) lines.push(`Sankalpa: ${sankalpa}`);
  if (s?.occasion) lines.push(`Occasion: ${s.occasion}`);
  lines.push('', `Amount: ${formatInr(booking.amountPaise)}`);
  if (paid > 0) lines.push(`Received: ${formatInr(paid)}${modes ? ` (${modes})` : ''}`);
  if (pendingPaise > 0) lines.push(`Balance due: ${formatInr(pendingPaise)}`);
  lines.push('', 'Sri Gurubhyo Namaha');
  return lines.join('\n');
}

/** A 10-digit Indian mobile, with or without +91 or a leading 0, as 91XXXXXXXXXX for wa.me. */
export function whatsAppNumber(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

/**
 * Opens WhatsApp straight to the devotee's chat when their mobile is known; otherwise the phone's share sheet,
 * so the volunteer can pick WhatsApp and the contact.
 */
export async function shareReceipt(text: string, phone: string | null): Promise<void> {
  const number = whatsAppNumber(phone);
  if (number) {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_system');
    return;
  }
  await shareText(text, 'Seva receipt');
}

export async function shareText(text: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ text, title, dialogTitle: title });
  } else if (navigator.share) {
    await navigator.share({ text, title });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
}
