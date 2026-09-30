export class CameraError extends Error {}

/** Starts the front camera and resolves once the first frame is ready. */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      window.isSecureContext
        ? 'Браузер не поддерживает доступ к камере. Открой приложение в Chrome, Edge или Safari.'
        : 'Камера работает только по HTTPS или на localhost. Открой приложение по защищённой ссылке.',
    );
  }
  const portrait = window.innerHeight > window.innerWidth;
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: portrait ? 720 : 1280 },
      height: { ideal: portrait ? 1280 : 720 },
      frameRate: { ideal: 30 },
    },
  };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new CameraError('Доступ к камере запрещён. Разреши его в настройках сайта (значок камеры в адресной строке) и обнови страницу.');
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      throw new CameraError('Камера не найдена. Подключи веб-камеру и обнови страницу.');
    if (name === 'NotReadableError')
      throw new CameraError('Камера занята другим приложением (Zoom, Meet, OBS?). Закрой его и обнови страницу.');
    throw new CameraError(`Не удалось включить камеру: ${(err as Error).message}`);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.readyState < 2) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
  return stream;
}
