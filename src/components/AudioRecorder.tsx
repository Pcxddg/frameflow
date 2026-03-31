import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, MicOff } from 'lucide-react';
import { GEMINI_FLASH_MODEL, generateContentWithRetry, getAiErrorMessage } from '../lib/gemini';

interface AudioRecorderProps {
  onTranscription: (text: string) => void;
}

export function AudioRecorder({ onTranscription }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const hasAudioInput = devices.some((device) => device.kind === 'audioinput');
          setHasMicrophone(hasAudioInput);
        })
        .catch((err) => {
          console.error('Error enumerating devices:', err);
          setHasMicrophone(true);
        });
    } else {
      setHasMicrophone(false);
    }
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscription(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      if (error.name === 'NotFoundError' || error.message?.includes('Requested device not found')) {
        alert('No se encontro ningun microfono conectado. Por favor, conecta uno e intentalo de nuevo.');
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('Permiso denegado para usar el microfono. Por favor, permite el acceso en tu navegador.');
      } else {
        alert('No se pudo acceder al microfono. Por favor, revisa los permisos y la conexion.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el audio grabado.'));
        reader.onloadend = () => {
          const base64data = reader.result as string;
          resolve(base64data.split(',')[1]);
        };
        reader.readAsDataURL(audioBlob);
      });

      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/webm',
                  data: base64String,
                },
              },
              {
                text: 'Transcribe este audio con precision. Solo devuelve la transcripcion, sin comentarios adicionales.',
              },
            ],
          },
        ],
      });

      if (response.text) {
        onTranscription(response.text);
      }
    } catch (error) {
      console.warn('Error transcribing audio:', error);
      alert(getAiErrorMessage(error, 'Hubo un error al transcribir el audio.'));
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      {hasMicrophone === false ? (
        <div className="relative group flex items-center justify-center cursor-not-allowed">
          <button
            disabled
            className="p-2 bg-gray-50 text-gray-400 rounded-full border border-gray-200 pointer-events-none transition-all"
          >
            <MicOff size={18} />
          </button>
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 p-2.5 bg-gray-800 text-white text-xs text-center rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-xl translate-y-1 group-hover:translate-y-0">
            No se detecto ningun microfono. Conecta uno o revisa los permisos de tu navegador.
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
          </div>
        </div>
      ) : !isRecording && !isTranscribing ? (
        <div className="relative group flex items-center justify-center">
          <button
            onClick={startRecording}
            className="p-2 bg-white border border-gray-200 text-gray-600 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-200 hover:shadow-sm transition-all duration-200"
          >
            <Mic size={18} />
          </button>
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-lg translate-y-1 group-hover:translate-y-0">
            Grabar nota de voz
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
          </div>
        </div>
      ) : null}

      {isRecording && (
        <div className="relative group flex items-center justify-center">
          <button
            onClick={stopRecording}
            className="p-2 bg-red-100 border border-red-200 text-red-600 rounded-full hover:bg-red-200 transition-all duration-200 animate-pulse shadow-sm"
          >
            <Square size={18} />
          </button>
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-lg translate-y-1 group-hover:translate-y-0">
            Detener grabacion
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-red-600"></div>
          </div>
        </div>
      )}

      {isTranscribing && (
        <div className="relative group flex items-center justify-center">
          <div className="p-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-full flex items-center justify-center shadow-sm">
            <Loader2 size={18} className="animate-spin" />
          </div>
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-lg translate-y-1 group-hover:translate-y-0">
            Transcribiendo...
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-blue-600"></div>
          </div>
        </div>
      )}
    </div>
  );
}
