import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// TRAINING LESSON GENERATOR API
// Genera lecciones y preguntas usando Monica AI (Gemini)
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(url, key);
}

interface GenerateLessonRequest {
  courseId: string;
  topic: string;
  questionCount?: number;
  difficulty?: 'principiante' | 'intermedio' | 'avanzado';
  context?: {
    productos?: unknown[];
    objeciones?: string[];
    casos_exito?: unknown[];
    custom?: Record<string, unknown>;
  };
}

interface GeneratedQuestion {
  tipo: 'multiple_choice' | 'true_false';
  pregunta: string;
  opciones: string[];
  respuesta_correcta: string;
  explicacion: string;
  dificultad: number;
}

interface GeneratedLesson {
  titulo: string;
  contenido_intro: string;
  questions: GeneratedQuestion[];
}

// ============================================================================
// POST - Generate a new lesson with questions
// ============================================================================

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[TrainingAPI:${requestId}] Starting lesson generation`);

  try {
    // Parse request
    const body: GenerateLessonRequest = await request.json();
    const { 
      courseId, 
      topic, 
      questionCount = 5, 
      difficulty = 'intermedio',
      context 
    } = body;

    // Validate
    if (!courseId || !topic) {
      return NextResponse.json(
        { error: 'Se requiere courseId y topic' },
        { status: 400 }
      );
    }

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY no configurada' },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify course exists
    const { data: course, error: courseError } = await supabase
      .from('training_courses')
      .select('id, titulo, empresa_id')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json(
        { error: 'Curso no encontrado' },
        { status: 404 }
      );
    }

    // Build context string for AI
    let contextPrompt = '';
    if (context) {
      if (context.productos?.length) {
        contextPrompt += `\n\nProductos/Servicios de la empresa:\n${JSON.stringify(context.productos, null, 2)}`;
      }
      if (context.objeciones?.length) {
        contextPrompt += `\n\nObjeciones comunes de clientes:\n${context.objeciones.join('\n- ')}`;
      }
      if (context.casos_exito?.length) {
        contextPrompt += `\n\nCasos de éxito:\n${JSON.stringify(context.casos_exito, null, 2)}`;
      }
      if (context.custom) {
        contextPrompt += `\n\nContexto adicional:\n${JSON.stringify(context.custom, null, 2)}`;
      }
    }

    // Build prompt for Gemini
    const systemPrompt = `Eres un experto en capacitación de equipos comerciales. Tu tarea es generar contenido de aprendizaje interactivo para vendedores.

REGLAS:
1. Las preguntas deben ser prácticas y aplicables al trabajo diario
2. Usa escenarios realistas que un vendedor enfrentaría
3. Las explicaciones deben ser breves pero útiles
4. Adapta la dificultad al nivel: ${difficulty}
5. Genera exactamente ${questionCount} preguntas
6. Para multiple_choice: siempre 4 opciones, respuesta_correcta es el índice (0-3)
7. Para true_false: 2 opciones ["Verdadero", "Falso"], respuesta_correcta es "0" o "1"

CONTEXTO DEL NEGOCIO:${contextPrompt || '\nNo hay contexto adicional disponible.'}`;

    const userPrompt = `Genera una lección sobre: "${topic}"

Responde SOLO con un objeto JSON válido con esta estructura exacta:
{
  "titulo": "Título atractivo de la lección",
  "contenido_intro": "Párrafo introductorio que explique qué aprenderán (2-3 oraciones)",
  "questions": [
    {
      "tipo": "multiple_choice",
      "pregunta": "¿Pregunta clara y específica?",
      "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "respuesta_correcta": "0",
      "explicacion": "Breve explicación de por qué esta es la respuesta correcta",
      "dificultad": 1
    }
  ]
}

IMPORTANTE: 
- Genera ${questionCount} preguntas variadas (mix de multiple_choice y true_false)
- La dificultad va de 1 (fácil) a 3 (difícil)
- NO incluyas markdown, solo el JSON puro`;

    console.log(`[TrainingAPI:${requestId}] Calling Gemini...`);

    // Call Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    });

    const responseText = result.response.text();
    console.log(`[TrainingAPI:${requestId}] Gemini response received`);

    // Parse JSON response
    let lessonData: GeneratedLesson;
    try {
      // Clean response (remove markdown if present)
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      lessonData = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error(`[TrainingAPI:${requestId}] JSON parse error:`, parseError);
      console.error(`[TrainingAPI:${requestId}] Raw response:`, responseText.substring(0, 500));
      return NextResponse.json(
        { error: 'Error al parsear respuesta de IA', details: 'Formato JSON inválido' },
        { status: 500 }
      );
    }

    // Validate structure
    if (!lessonData.titulo || !lessonData.questions || !Array.isArray(lessonData.questions)) {
      return NextResponse.json(
        { error: 'Respuesta de IA incompleta', details: 'Faltan campos requeridos' },
        { status: 500 }
      );
    }

    // Get next order number for lesson
    const { data: existingLessons } = await supabase
      .from('training_lessons')
      .select('orden')
      .eq('course_id', courseId)
      .order('orden', { ascending: false })
      .limit(1);

    const nextOrder = existingLessons?.length ? (existingLessons[0].orden + 1) : 1;

    // Insert lesson
    const { data: newLesson, error: lessonError } = await supabase
      .from('training_lessons')
      .insert({
        course_id: courseId,
        orden: nextOrder,
        titulo: lessonData.titulo,
        contenido_intro: lessonData.contenido_intro || '',
        xp_reward: 10 + (questionCount * 2),
        xp_perfect_bonus: 25,
        tiempo_estimado_seg: questionCount * 30
      })
      .select()
      .single();

    if (lessonError || !newLesson) {
      console.error(`[TrainingAPI:${requestId}] Lesson insert error:`, lessonError);
      return NextResponse.json(
        { error: 'Error al guardar lección', details: lessonError?.message },
        { status: 500 }
      );
    }

    // Insert questions
    const questionsToInsert = lessonData.questions.map((q, index) => ({
      lesson_id: newLesson.id,
      tipo: q.tipo,
      pregunta: q.pregunta,
      opciones: q.opciones,
      respuesta_correcta: q.respuesta_correcta,
      explicacion: q.explicacion || '',
      dificultad: q.dificultad || 1,
      ai_generated: true,
      ai_context: context || null,
      orden: index + 1
    }));

    const { error: questionsError } = await supabase
      .from('training_questions')
      .insert(questionsToInsert);

    if (questionsError) {
      console.error(`[TrainingAPI:${requestId}] Questions insert error:`, questionsError);
      // Rollback lesson
      await supabase.from('training_lessons').delete().eq('id', newLesson.id);
      return NextResponse.json(
        { error: 'Error al guardar preguntas', details: questionsError.message },
        { status: 500 }
      );
    }

    console.log(`[TrainingAPI:${requestId}] Lesson created successfully:`, newLesson.id);

    return NextResponse.json({
      success: true,
      lesson: {
        id: newLesson.id,
        titulo: newLesson.titulo,
        contenido_intro: newLesson.contenido_intro,
        questionsCount: questionsToInsert.length
      }
    });

  } catch (error: unknown) {
    console.error(`[TrainingAPI:${requestId}] Fatal error:`, error);
    return NextResponse.json(
      { 
        error: 'Error interno al generar lección', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
