// Qué sabe reproducir este televisor. Se envía al PC para decidir si el video se reproduce
// directamente o hay que convertirlo (por ejemplo, audio DTS).
let cached: string | null = null;

export function detectCaps(): string {
  if (cached !== null) return cached;
  const v = document.createElement('video');
  const can = (type: string) => {
    try {
      const r = v.canPlayType(type);
      return r === 'probably' || r === 'maybe';
    } catch {
      return false;
    }
  };
  const caps: string[] = [];
  const add = (key: string, ok: boolean) => {
    if (ok) caps.push(key);
  };
  // Contenedores
  add('c.mp4', true);
  add('c.mov', can('video/quicktime'));
  add('c.mkv', can('video/x-matroska'));
  add('c.webm', can('video/webm'));
  add('c.ts', can('video/mp2t'));
  add('c.avi', can('video/x-msvideo'));
  // Video
  add('v.h264', can('video/mp4; codecs="avc1.640028"') || can('video/mp4; codecs="avc1.4d401f"'));
  add('v.hevc', can('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hev1.1.6.L120.90"'));
  add('v.vp9', can('video/webm; codecs="vp9"') || can('video/mp4; codecs="vp09.00.10.08"'));
  add('v.av1', can('video/mp4; codecs="av01.0.08M.08"'));
  // Audio
  add('a.aac', can('audio/mp4; codecs="mp4a.40.2"'));
  add('a.mp3', can('audio/mpeg'));
  add('a.ac3', can('audio/mp4; codecs="ac-3"'));
  add('a.eac3', can('audio/mp4; codecs="ec-3"'));
  add('a.opus', can('audio/webm; codecs="opus"') || can('audio/mp4; codecs="opus"'));
  add('a.flac', can('audio/flac') || can('audio/mp4; codecs="flac"'));
  cached = caps.join(',');
  return cached;
}
