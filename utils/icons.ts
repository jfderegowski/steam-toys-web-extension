// Achievement icons: the files the JSON carries, and telling whether one already is on Steamworks.

import type { IconFile } from './payload';

/** Side of the square both icons are drawn at to compare them. */
const COMPARE_SIZE = 64;

/**
 * Highest mean difference per colour channel, out of 255, at which two icons still count as the
 * same. Steam keeps icons as JPG, so an icon it re-encoded differs a little everywhere, while a
 * replaced icon differs a lot: 1.9 for a JPG re-encoded at 70% quality, 10.7 for a colour icon
 * against its greyscale version.
 */
const SAME_THRESHOLD = 4;

export function iconBlob(icon: IconFile): Blob {
  const bytes = Uint8Array.from(atob(icon.data), (char) => char.charCodeAt(0));
  const type = /\.jpe?g$/i.test(icon.fileName) ? 'image/jpeg' : 'image/png';
  return new Blob([bytes], { type });
}

/** The icon Steamworks has at `url`, or null when there is none or it cannot be read. */
export async function fetchSteamIcon(url: string | undefined): Promise<Blob | null> {
  if (!url) return null;
  try {
    const response = await fetch(new URL(url, location.href));
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/**
 * Whether two icons look the same, drawn at the same size. Compared over a black and over a white
 * background, since Steam flattens the transparency of a PNG onto one of them when it makes the JPG.
 */
export async function looksSame(a: Blob, b: Blob): Promise<boolean> {
  const [imageA, imageB] = await Promise.all([createImageBitmap(a), createImageBitmap(b)]);
  try {
    for (const background of ['#000', '#fff']) {
      if (meanDifference(pixels(imageA, background), pixels(imageB, background)) <= SAME_THRESHOLD) return true;
    }
    return false;
  } finally {
    imageA.close();
    imageB.close();
  }
}

function pixels(image: ImageBitmap, background: string): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(COMPARE_SIZE, COMPARE_SIZE);
  const context = canvas.getContext('2d')!;
  context.fillStyle = background;
  context.fillRect(0, 0, COMPARE_SIZE, COMPARE_SIZE);
  context.drawImage(image, 0, 0, COMPARE_SIZE, COMPARE_SIZE);
  return context.getImageData(0, 0, COMPARE_SIZE, COMPARE_SIZE).data;
}

function meanDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 4) {
    total += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
  }
  return total / ((a.length / 4) * 3);
}
