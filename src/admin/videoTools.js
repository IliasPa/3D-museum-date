/**
 * Turns a video file (e.g. an iPhone .MOV in HEVC, any size) into a small
 * MP4 (H.264 + AAC) that plays on every phone and browser — inside the
 * browser, using its built-in video encoder (via the mediabunny library,
 * which is only downloaded when you add a video).
 *
 *   • at most 1280 px on the long side, ~1.6 Mbit/s → about 12 MB per minute
 *   • at most MAX_SECONDS long (longer videos are trimmed)
 *   • plus a poster picture (shown on the wall until someone sits down)
 */
export const MAX_SECONDS = 120;
const LONG_EDGE = 1280;

/**
 * @param file        the video File
 * @param onProgress  (0…1) while converting
 * @returns { bytes, width, height, duration, poster }
 */
export async function processVideo(file, onProgress = () => {}) {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('no picture in this file');
  const duration = Math.min(await input.computeDuration(), MAX_SECONDS);
  const landscape = track.displayWidth >= track.displayHeight;
  const size = landscape
    ? { width: Math.min(LONG_EDGE, track.displayWidth) & ~1 }
    : { height: Math.min(LONG_EDGE, track.displayHeight) & ~1 };

  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { ...size, codec: 'avc', bitrate: 1_600_000, forceTranscode: true },
    audio: { codec: 'aac', bitrate: 96_000 },
    trim: { start: 0, end: duration },
    showWarnings: false,
  });
  if (!conversion.isValid) {
    const why = conversion.discardedTracks.map((d) => d.reason).join(', ');
    throw new Error(`this browser can’t convert this video (${why || 'unsupported'}) — try Chrome or Safari on a computer`);
  }
  conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();
  const bytes = new Uint8Array(output.target.buffer);
  const { poster, width, height } = await posterFrom(bytes);
  return { bytes, width, height, duration, poster };
}

/** A JPEG still (≈640 px) from about a third into the converted video. */
async function posterFrom(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('the converted video can’t be played back'));
    });
    video.currentTime = Math.min(1.5, video.duration / 3);
    await new Promise((resolve) => (video.onseeked = resolve));
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return { poster: new Uint8Array(await blob.arrayBuffer()), width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
