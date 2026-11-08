import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

/** Opens the phone's share sheet with the text (the priest list), or the browser's when there is one. */
export async function shareText(text: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ text, title, dialogTitle: title });
  } else if (navigator.share) {
    await navigator.share({ text, title });
  } else {
    await navigator.clipboard?.writeText(text);
  }
}
