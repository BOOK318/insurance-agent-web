export type WavRecorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
};

type AudioContextConstructor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor;
  }
}

export async function startWavRecording(): Promise<WavRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone recording is not supported');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioCtx) {
    stream.getTracks().forEach(track => track.stop());
    throw new Error('AudioContext is not supported');
  }

  const audioContext = new AudioCtx();
  await audioContext.resume().catch(() => {});

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;

  const chunks: Float32Array[] = [];
  processor.onaudioprocess = event => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(audioContext.destination);

  let stopped = false;
  const cleanup = async () => {
    processor.disconnect();
    source.disconnect();
    silentOutput.disconnect();
    stream.getTracks().forEach(track => track.stop());
    await audioContext.close().catch(() => {});
  };

  return {
    stop: async () => {
      if (stopped) return encodeWav(chunks, audioContext.sampleRate);
      stopped = true;
      await cleanup();
      return encodeWav(chunks, audioContext.sampleRate);
    },
    cancel: () => {
      if (stopped) return;
      stopped = true;
      void cleanup();
    },
  };
}

function encodeWav(chunks: Float32Array[], sampleRate: number) {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
