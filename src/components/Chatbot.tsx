import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { GEMINI_FLASH_MODEL, generateContentWithRetry, getAiErrorMessage } from '../lib/gemini';
import ReactMarkdown from 'react-markdown';
import { useBoard } from '../store';
import { Type, FunctionDeclaration } from '@google/genai';
import { useIsMobile } from '../hooks/useIsMobile';

const addCardDeclaration: FunctionDeclaration = {
  name: "addCard",
  description: "Añade una nueva tarjeta/video a una columna especifica del tablero.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      listId: {
        type: Type.STRING,
        description: "El ID de la lista/columna donde se añadira la tarjeta (ej. 'list-1' para Ideas, 'list-2' para Titulos).",
      },
      title: {
        type: Type.STRING,
        description: "El titulo de la tarjeta o video.",
      },
    },
    required: ["listId", "title"],
  },
};

const moveCardDeclaration: FunctionDeclaration = {
  name: "moveCard",
  description: "Mueve una tarjeta existente a otra columna del tablero.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      cardId: {
        type: Type.STRING,
        description: "El ID de la tarjeta a mover.",
      },
      destListId: {
        type: Type.STRING,
        description: "El ID de la lista/columna de destino.",
      },
    },
    required: ["cardId", "destListId"],
  },
};

const updateCardDeclaration: FunctionDeclaration = {
  name: "updateCard",
  description: "Actualiza los detalles de una tarjeta (descripcion, tema, objetivo, etc.).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      cardId: {
        type: Type.STRING,
        description: "El ID de la tarjeta a actualizar.",
      },
      title: {
        type: Type.STRING,
        description: "El nuevo titulo de la tarjeta.",
      },
      description: {
        type: Type.STRING,
        description: "La nueva descripcion de la tarjeta.",
      },
    },
    required: ["cardId"],
  },
};

const suggestKeywordsDeclaration: FunctionDeclaration = {
  name: "suggestKeywords",
  description: "Sugiere palabras clave long-tail SEO para un video y las guarda en la tarjeta.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      cardId: {
        type: Type.STRING,
        description: "ID de la tarjeta",
      },
      keywords: {
        type: Type.STRING,
        description: "Palabras clave sugeridas, separadas por coma",
      },
    },
    required: ["cardId", "keywords"],
  },
};

const updateMonetizationDeclaration: FunctionDeclaration = {
  name: "updateMonetization",
  description: "Actualiza los campos de monetizacion de una tarjeta (afiliados, patrocinadores, RPM).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      cardId: {
        type: Type.STRING,
        description: "ID de la tarjeta",
      },
      hasAffiliate: { type: Type.BOOLEAN, description: "Tiene link de afiliado" },
      affiliateLinks: { type: Type.STRING, description: "URLs de afiliados" },
      hasSponsor: { type: Type.BOOLEAN, description: "Tiene patrocinador" },
      sponsorName: { type: Type.STRING, description: "Nombre del patrocinador" },
      estimatedRPM: { type: Type.NUMBER, description: "RPM estimado en dolares" },
      sellsProduct: { type: Type.BOOLEAN, description: "Vende un producto o solucion" },
    },
    required: ["cardId"],
  },
};

const setContentTypeDeclaration: FunctionDeclaration = {
  name: "setContentType",
  description: "Marca una tarjeta como Short o Video Largo.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      cardId: {
        type: Type.STRING,
        description: "ID de la tarjeta",
      },
      contentType: {
        type: Type.STRING,
        description: "'long' para video largo o 'short' para short",
      },
    },
    required: ["cardId", "contentType"],
  },
};

const allDeclarations = [
  addCardDeclaration,
  moveCardDeclaration,
  updateCardDeclaration,
  suggestKeywordsDeclaration,
  updateMonetizationDeclaration,
  setContentTypeDeclaration,
];

const SUGGESTION_CHIPS = [
  "Sugiereme titulos para mi proximo video",
  "Analiza mi pipeline",
  "Ayudame con SEO para un video",
  "Revisa mi estrategia de monetizacion",
];

interface ChatbotProps {
  hideTrigger?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function Chatbot({ hideTrigger = false, isOpen: controlledIsOpen, onOpenChange }: ChatbotProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = (nextIsOpen: boolean) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(nextIsOpen);
    }
    onOpenChange?.(nextIsOpen);
  };

  const { board, addCard, updateCard, moveCard } = useBoard();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (messageText?: string) => {
    const userMessage = (messageText || input).trim();
    if (!userMessage || isLoading) return;
    if (!board) {
      setInput('');
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Selecciona un canal antes de usar el asistente.' }
      ]);
      return;
    }

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      let context = "Estado actual del tablero:\n\n";
      board.lists.forEach(list => {
        context += `Columna: "${list.title}" (ID: ${list.id})\n`;
        list.cardIds.forEach(cardId => {
          const card = board.cards[cardId];
          if (card) {
            context += `  - Tarjeta: "${card.title}" (ID: ${card.id})`;
            context += ` [Tipo: ${card.contentType || 'sin definir'}]`;
            if (card.ctr2Hours) context += ` [CTR: ${card.ctr2Hours}%]`;
            if (card.monetization?.revenue) context += ` [Revenue: $${card.monetization.revenue}]`;
            if (card.keywords) context += ` [Keywords: ${card.keywords}]`;
            if (card.assignee) context += ` [Asignado: ${card.assignee}]`;
            context += '\n';
          }
        });
        context += "\n";
      });

      // Summary stats
      const cards = Object.values(board.cards);
      const publishedCount = board.lists[board.lists.length - 1]?.cardIds.length || 0;
      const totalRevenue = cards.reduce((sum, c) => sum + (c.monetization?.revenue || 0), 0);
      context += `\nResumen: ${cards.length} tarjetas total, ${publishedCount} publicados, $${totalRevenue.toFixed(0)} ingresos totales.\n`;

      const systemInstruction = `Eres un Estratega de Crecimiento de YouTube nivel experto, enfocado en Retencion, CTR y Psicologia del Clic.
Tu mision es ayudar al creador a diseñar videos virales. Exiges la estructura narrativa "Queria X, PERO paso Y, POR LO TANTO hice Z" (Regla de South Park).
Generas ganchos de 8 segundos (Start with the End, Punto de Dolor o Ruptura visual), y aplicas el "Metodo Linden" para sugerir multiples variantes de titulos que balanceen SEO y Brecha de Curiosidad.

Capacidades adicionales:
- Puedes sugerir palabras clave long-tail para SEO evergreen (cola larga, menos volumen pero cero competencia).
- Puedes analizar la monetizacion de un video y sugerir estrategias de afiliados/sponsors.
- Conoces la diferencia entre Shorts (top of funnel, alcance masivo) y Videos Largos (bottom of funnel, profundidad y conexion).
- Puedes ejecutar el Protocolo Post-Publicacion: revisar CTR a 2h, sugerir acciones de emergencia si CTR < 4%.
- Puedes marcar tarjetas como Short o Video Largo.

Puedes interactuar con el tablero Kanban del usuario usando las herramientas disponibles para crear, mover, actualizar tarjetas, sugerir keywords, actualizar monetizacion y definir tipo de contenido.
${context}`;

      const history: any[] = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));
      history.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });

      const response = await generateContentWithRetry({
        model: GEMINI_FLASH_MODEL,
        contents: history,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: allDeclarations }]
        }
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        let resultText = "Accion realizada con exito.";

        if (call.name === 'addCard') {
          const { listId, title } = call.args as any;
          addCard(listId, title);
          resultText = `Tarjeta "${title}" añadida a la lista ${listId}.`;
        } else if (call.name === 'moveCard') {
          const { cardId, destListId } = call.args as any;
          let sourceListId = '';
          let sourceIndex = -1;
          for (const list of board.lists) {
            const idx = list.cardIds.indexOf(cardId);
            if (idx !== -1) {
              sourceListId = list.id;
              sourceIndex = idx;
              break;
            }
          }
          const destList = board.lists.find(l => l.id === destListId);
          if (sourceListId && destList) {
            moveCard(sourceListId, destListId, sourceIndex, destList.cardIds.length, cardId);
            resultText = `Tarjeta movida a la lista ${destListId}.`;
          } else {
            resultText = `Error: No se encontro la tarjeta o la lista de destino.`;
          }
        } else if (call.name === 'updateCard') {
          const { cardId, title, description } = call.args as any;
          const updates: any = {};
          if (title) updates.title = title;
          if (description) updates.description = description;
          updateCard(cardId, updates);
          resultText = `Tarjeta actualizada.`;
        } else if (call.name === 'suggestKeywords') {
          const { cardId, keywords } = call.args as any;
          updateCard(cardId, { keywords });
          resultText = `Palabras clave actualizadas: ${keywords}`;
        } else if (call.name === 'updateMonetization') {
          const { cardId, ...monetizationFields } = call.args as any;
          const card = board.cards[cardId];
          updateCard(cardId, { monetization: { ...card?.monetization, ...monetizationFields } });
          resultText = `Monetizacion actualizada.`;
        } else if (call.name === 'setContentType') {
          const { cardId, contentType } = call.args as any;
          updateCard(cardId, { contentType });
          resultText = `Tipo de contenido establecido: ${contentType}.`;
        }

        history.push({
          role: 'model',
          parts: response.candidates![0].content.parts
        });

        history.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: call.name,
              response: { result: resultText }
            }
          }]
        });

        const finalResponse = await generateContentWithRetry({
          model: GEMINI_FLASH_MODEL,
          contents: history,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: allDeclarations }]
          }
        });

        setMessages((prev) => [...prev, { role: 'model', text: finalResponse.text || 'Hecho.' }]);
      } else {
        setMessages((prev) => [...prev, { role: 'model', text: response.text || 'Sin respuesta' }]);
      }
    } catch (error) {
      console.warn('Error calling Gemini:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: getAiErrorMessage(error, 'Lo siento, no pude procesar tu solicitud en este momento.') }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Chat Button */}
      {!hideTrigger && !isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-xl shadow-blue-600/25 hover:shadow-2xl hover:shadow-blue-600/30 hover:scale-105 transition-all duration-300 z-40 ${isOpen ? 'hidden' : 'flex'}`}
        >
          <MessageSquare size={24} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className={`ff-chatbot fixed flex flex-col z-50 overflow-hidden ${isMobile ? 'inset-0 rounded-none ff-fade-in' : 'bottom-6 right-6 w-96 h-[500px] rounded-2xl shadow-2xl ff-slide-up'}`}
          style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border-medium)` }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare size={20} />
              <h3 className="font-semibold">Asistente de Produccion</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="ff-scrollbar flex-1 overflow-y-auto p-4 space-y-4" style={{ background: `var(--ff-surface-muted)` }}>
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="text-center text-sm mt-4" style={{ color: `var(--ff-text-secondary)` }}>
                  {board
                    ? 'Soy tu asistente de produccion. Puedo ayudarte con titulos, SEO, storytelling, monetizacion y organizar tu tablero.'
                    : 'Selecciona un canal para activar el asistente y trabajar sobre un tablero real.'}
                </div>
                {/* Suggestion Chips */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTION_CHIPS.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(chip)}
                      disabled={!board}
                      className="text-xs px-3 py-1.5 rounded-full transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: `var(--ff-info-bg)`, color: `var(--ff-info-text)`, border: `1px solid var(--ff-info-border)` }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[80%] p-3 rounded-2xl text-sm"
                  style={msg.role === 'user'
                    ? { background: `var(--ff-primary)`, color: `var(--ff-text-inverse)`, borderBottomRightRadius: 0 }
                    : { background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)`, border: `1px solid var(--ff-border)`, borderBottomLeftRadius: 0, boxShadow: `var(--ff-shadow-sm)` }}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm max-w-none prose-p:leading-snug prose-p:my-1">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="p-3 rounded-2xl rounded-bl-none flex items-center space-x-2" style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border)`, boxShadow: `var(--ff-shadow-sm)` }}>
                  <Loader2 size={16} className="animate-spin text-blue-600" />
                  <span className="text-sm" style={{ color: `var(--ff-text-secondary)` }}>Escribiendo...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="p-3 shrink-0"
            style={{
              background: `var(--ff-surface-solid)`,
              borderTop: `1px solid var(--ff-border)`,
              ...(isMobile ? { paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' } : undefined),
            }}
          >
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={board ? 'Escribe un mensaje...' : 'Selecciona un canal para activar el asistente'}
                disabled={!board}
                className="flex-1 p-2.5 px-4 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!board || !input.trim() || isLoading}
                className="p-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full hover:shadow-md hover:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
