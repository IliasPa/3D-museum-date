/**
 * Turns a video file (e.g. an iPhone .MOV in HEVC, any size and length) into
 * a small MP4 (H.264 + AAC) that plays on every phone and browser — inside the
 * browser, using its built-in video encoder (via the mediabunny library,
 * which is only downloaded when you add a video).
 *
 *   • at most MAX_VIDEO_MB megabytes: short videos get the best quality
 *     (1280 px, ~1.6 Mbit/s ≈ 12 MB a minute); longer ones a lower bitrate
 *     and resolution, so they still fit
 *   • at most 30 frames a second
 *   • plus a poster picture (shown on the wall until someone sits down)
 */
export const MAX_VIDEO_MB = 50;
const MB = 1024 * 1024;
const AUDIO_BITRATE = 96_000;
const BEST_BITRATE = 1_600_000; // video bits per second at 1280 px
const LOWEST_BITRATE = 250_000; // below this a film looks too blurry to be worth it
const SAFETY = 0.92; // encoders overshoot a little; the MP4 box adds a little

/**
 * @param file  the video File
 * @param opts  { maxBytes (default MAX_VIDEO_MB), onProgress (0…1 while converting) }
 * @returns { bytes, width, height, duration, poster }
 */
export async function processVideo(file, { maxBytes = MAX_VIDEO_MB * MB, onProgress = () => {} } = {}) {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('no picture in this file');
  const duration = await input.computeDuration();
  const hasAudio = Boolean(await input.getPrimaryAudioTrack());

  // Share the size budget out over the length of the film.
  const audio = hasAudio ? AUDIO_BITRATE : 0;
  let bitrate = Math.min(BEST_BITRATE, (maxBytes * 8 * SAFETY) / duration - audio);
  if (bitrate < LOWEST_BITRATE) {
    const longest = (maxBytes * 8 * SAFETY) / (LOWEST_BITRATE + audio) / 60;
    throw new Error(`it’s ${Math.round(duration / 60)} minutes long — in ${Math.round(maxBytes / MB)} MB a video can be at most about ${Math.floor(longest)} minutes`);
  }
  const longEdge = bitrate >= 1_100_000 ? 1280 : bitrate >= 600_000 ? 960 : 640;
  const landscape = track.displayWidth >= track.displayHeight;
  const size = landscape
    ? { width: Math.min(longEdge, track.displayWidth) & ~1 }
    : { height: Math.min(longEdge, track.displayHeight) & ~1 };
  const stats = await track.computePacketStats(120);

  for (let attempt = 0; ; attempt++) {
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        ...size,
        codec: 'avc',
        bitrate: Math.round(bitrate),
        forceTranscode: true,
        ...(stats.averagePacketRate > 31 ? { frameRate: 30 } : {}),
      },
      audio: { codec: 'aac', bitrate: AUDIO_BITRATE },
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const why = conversion.discardedTracks.map((d) => d.reason).join(', ');
      throw new Error(`this browser can’t convert this video (${why || 'unsupported'}) — try Safari or Chrome on a computer`);
    }
    conversion.onProgress = (p) => onProgress(p);
    await withBaselineH264(() => conversion.execute());
    const bytes = new Uint8Array(output.target.buffer);
    if (bytes.length > maxBytes && attempt < 2) {
      bitrate *= ((maxBytes / bytes.length) * 0.95); // the encoder overshot: once more, a bit smaller
      continue;
    }
    if (bytes.length > maxBytes) throw new Error(`it came out at ${(bytes.length / MB).toFixed(0)} MB, more than ${Math.round(maxBytes / MB)} MB`);
    const { poster, width, height } = await posterFrom(mb, bytes);
    return { bytes, width, height, duration, poster };
  }
}

/**
 * Safari's H.264 encoder never produces a single frame with the Main or High
 * profile (the conversion just hangs), while the Baseline profile works in
 * every browser — and plays on every phone. So while converting, any H.264
 * encoder is set up as Baseline (same level).
 */
async function withBaselineH264(run) {
  const proto = globalThis.VideoEncoder?.prototype;
  const configure = proto?.configure;
  if (!configure) return run();
  proto.configure = function (config) {
    const avc = /^avc1\.[0-9a-f]{4}([0-9a-f]{2})$/i.exec(config?.codec ?? '');
    return configure.call(this, avc ? { ...config, codec: `avc1.42e0${avc[1]}` } : config);
  };
  try {
    return await run();
  } finally {
    proto.configure = configure;
  }
}

/** A JPEG still (≈640 px) from about a third into the converted video, decoded with WebCodecs. */
async function posterFrom(mb, bytes) {
  const input = new mb.Input({ source: new mb.BufferSource(bytes), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('the converted video has no picture');
  const width = track.displayWidth;
  const height = track.displayHeight;
  const scale = Math.min(1, 640 / Math.max(width, height));
  const sink = new mb.CanvasSink(track, { width: Math.round(width * scale), height: Math.round(height * scale), fit: 'fill' });
  const at = Math.min(1.5, (await input.computeDuration()) / 3);
  const frame = (await sink.getCanvas(at)) ?? (await sink.getCanvas(0));
  if (!frame) throw new Error('the converted video can’t be played back');
  const { canvas } = frame;
  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    : await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  return { poster: new Uint8Array(await blob.arrayBuffer()), width, height };
}
