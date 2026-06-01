/* ==========================================================================
   JS Preguntas de Entrevista - Lógica Frontend (Phase 3)
   ========================================================================== */

// Claves de localStorage
const MOCK_QUESTIONS_KEY = 'job_tracker_questions';
const MOCK_OFFERS_KEY = 'job_tracker_offers';

function getStorageKey(baseKey) {
    const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
    if (session && session.user && session.user.email) {
        return `${baseKey}_user_${session.user.email}`;
    }
    return baseKey;
}

// Endpoints del servidor
const API_BASE_QUESTIONS = window.API_BASE_URL || 'servidor';
const API_QUESTIONS_URLS = {
    list: `${API_BASE_QUESTIONS}/questions.php`,
    create: `${API_BASE_QUESTIONS}/questions.php`,
    update: `${API_BASE_QUESTIONS}/questions.php`,
    delete: `${API_BASE_QUESTIONS}/questions.php`
};

// Estado global de la vista de preguntas
const AppStateQuestions = {
    questions: [],
    filteredQuestions: [],
    offers: [],
    selectedQuestionId: null,
    filters: {
        search: '',
        category: '',
        difficulty: ''
    }
};

// Preguntas Mock pre-cargadas
const INITIAL_MOCK_QUESTIONS = [
    {
        id: 'mock-q-1',
        question: 'Háblame de ti',
        answer: 'Comienza con un breve resumen de tu trayectoria profesional, destacando tus logros más relevantes en desarrollo de software y cómo tu experiencia se alinea con los requisitos del puesto. Evita detalles personales irrelevantes y concéntrate en tus pasiones y motivación para unirte a la empresa.',
        category: 'General',
        difficulty: 'Fácil',
        application_id: null
    },
    {
        id: 'mock-q-2',
        question: 'Dificultades técnicas y cómo las superaste',
        answer: 'Usa el método STAR (Situación, Tarea, Acción, Resultado). Describe un problema complejo en producción o durante el desarrollo, explica qué alternativas evaluaste, cuál fue tu solución (por ejemplo, refactorizar una consulta lenta, solventar un memory leak) y el impacto cuantificable (ej. mejora del rendimiento en un 40%).',
        category: 'Específica',
        difficulty: 'Media',
        application_id: null
    },
    {
        id: 'mock-q-3',
        question: '¿Por qué quieres trabajar con nosotros?',
        answer: 'Investiga los valores, la cultura, los productos y los desafíos recientes de la empresa. Conecta estos puntos con tus metas profesionales a largo plazo. Menciona tecnologías específicas o proyectos que te entusiasmen y explica cómo crees que puedes aportar valor real al equipo.',
        category: 'General',
        difficulty: 'Fácil',
        application_id: null
    },
    {
        id: 'mock-q-4',
        question: 'Explica el funcionamiento de la delegación de eventos en JavaScript',
        answer: 'La delegación de eventos consiste en asociar un único manejador de eventos a un elemento padre común en lugar de a múltiples elementos hijos. Esto aprovecha la fase de propagación de eventos (event bubbling), donde el evento se propaga hacia arriba en el DOM. Es una práctica recomendada para ahorrar memoria y manejar elementos que se agregan dinámicamente.',
        category: 'Específica',
        difficulty: 'Media',
        application_id: null
    },
    {
        id: 'mock-q-5',
        question: '¿Cómo manejas una situación en la que no estás de acuerdo con una decisión de diseño técnico del arquitecto o del equipo?',
        answer: 'Muestra empatía y profesionalidad. Explica que primero intentas entender el contexto y los motivos detrás de la propuesta ajena. Luego, presentas alternativas constructivas apoyadas en datos o pruebas de concepto sencillas de forma respetuosa. Si finalmente se toma una decisión con la que difiero, la acato y me comprometo al 100% con su éxito (Disentir y comprometerse).',
        category: 'General',
        difficulty: 'Difícil',
        application_id: null
    }
];

// Modales Bootstrap
let questionModal;
let confirmDeleteQuestionModal;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modales
    questionModal = new bootstrap.Modal(document.getElementById('modal-question'));
    confirmDeleteQuestionModal = new bootstrap.Modal(document.getElementById('modal-confirm-delete-question'));

    // Configurar listeners de la interfaz
    initEventListeners();

    // Rellenar navbar con nombre si está logueado
    const session = Auth.isAuthenticated();
    if (session && session.user) {
        document.getElementById('navbar-username').textContent = session.user.nombre;
    }

    // Cargar ofertas activas e inicializar preguntas
    loadInitialData();
});

// Inicializar todos los Listeners del DOM
function initEventListeners() {
    // Botón nueva pregunta
    document.getElementById('btn-new-question').addEventListener('click', () => {
        openQuestionModal();
    });

    // Botón nueva pregunta en Empty State
    document.getElementById('btn-empty-add-question').addEventListener('click', () => {
        openQuestionModal();
    });

    // Envío del formulario de la pregunta
    document.getElementById('form-question').addEventListener('submit', handleQuestionSubmit);

    // Botón confirmar borrado en modal de confirmación
    document.getElementById('btn-confirm-delete-question-action').addEventListener('click', () => {
        if (AppStateQuestions.selectedQuestionId) {
            deleteQuestion(AppStateQuestions.selectedQuestionId);
        }
    });

    // Buscador interactivo (con un retardo/debounce de 300ms)
    let searchTimeout;
    document.getElementById('search-question-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            AppStateQuestions.filters.search = e.target.value.trim().toLowerCase();
            applyFiltersAndRender();
        }, 300);
    });

    // Filtro de Categoría
    document.getElementById('filter-question-category').addEventListener('change', (e) => {
        AppStateQuestions.filters.category = e.target.value;
        applyFiltersAndRender();
    });

    // Filtro de Dificultad
    document.getElementById('filter-question-difficulty').addEventListener('change', (e) => {
        AppStateQuestions.filters.difficulty = e.target.value;
        applyFiltersAndRender();
    });

    // Botón de salir de sesión
    document.getElementById('btn-logout').addEventListener('click', () => {
        Auth.logout();
    });
}

// Cargar ofertas para selector y luego preguntas
async function loadInitialData() {
    showLoader(true);
    
    // Cargar ofertas (para poder relacionarlas y rellenar el dropdown)
    AppStateQuestions.offers = await fetchOffersList();
    populateOffersDropdown();

    // Cargar preguntas
    await loadQuestions();
    showLoader(false);
}

// Obtener lista de ofertas del servidor o localStorage fallback
async function fetchOffersList() {
    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_QUESTIONS}/applications.php`, { headers });
        if (response.status === 401) {
            Auth.logout();
            return [];
        }
        if (response.ok) {
            const data = await response.json();
            // Mapear los datos de BD a las claves que espera el frontend
            return (data || []).map(o => ({
                id: o.id,
                empresa: o.company,
                puesto: o.title,
                fecha_postulacion: o.date_applied,
                estado: o.status,
                salario: o.salario || null,
                enlace: o.url || '',
                notas: o.description || '',
                modalidad: o.modalidad || 'Presencial',
                ubicacion: o.ubicacion_nombre || '',
                lat: o.latitud ? parseFloat(o.latitud) : null,
                lon: o.longitud ? parseFloat(o.longitud) : null
            }));
        } else {
            throw new Error('Error al obtener ofertas de la API');
        }
    } catch (error) {
        console.warn('Cargando ofertas desde localStorage fallback para preguntas.');
        const localOffers = localStorage.getItem(getStorageKey(MOCK_OFFERS_KEY));
        return localOffers ? JSON.parse(localOffers) : [];
    }
}

// Cargar preguntas desde la API o localStorage fallback
async function loadQuestions() {
    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_QUESTIONS_URLS.list, { headers });
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        if (response.ok) {
            const data = await response.json();
            // Mapear los datos de la base de datos a las claves que espera el frontend
            AppStateQuestions.questions = (data || []).map(q => ({
                id: q.id,
                application_id: q.application_id,
                category: q.category,
                difficulty: q.difficulty,
                question: q.question_text,
                answer: q.answer_text,
                empresa: q.empresa || ''
            }));
        } else {
            throw new Error('Servidor de preguntas no disponible o no implementado aún.');
        }
    } catch (error) {
        console.warn('Usando base de datos local para preguntas de entrevista (Fallback LocalStorage).');
        const session = Auth.isAuthenticated();
        
        let localData = localStorage.getItem(getStorageKey(MOCK_QUESTIONS_KEY));
        if (session) {
            AppStateQuestions.questions = localData ? JSON.parse(localData) : [];
        } else {
            if (!localData) {
                // Guardar preguntas iniciales demo si no hay datos creados
                localStorage.setItem(getStorageKey(MOCK_QUESTIONS_KEY), JSON.stringify(INITIAL_MOCK_QUESTIONS));
                localData = JSON.stringify(INITIAL_MOCK_QUESTIONS);
            }
            AppStateQuestions.questions = JSON.parse(localData);
        }
    }

    applyFiltersAndRender();
}

// Rellenar dropdown de ofertas asociadas en el modal
function populateOffersDropdown() {
    const selectOffer = document.getElementById('question-offer-id');
    selectOffer.innerHTML = '<option value="">General (No asociada a ninguna oferta específica)</option>';
    
    if (AppStateQuestions.offers && AppStateQuestions.offers.length > 0) {
        AppStateQuestions.offers.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            // Mostramos empresa y puesto
            opt.textContent = `${o.empresa} - ${o.puesto || 'Puesto no especificado'}`;
            selectOffer.appendChild(opt);
        });
    }
}

// Filtrar las preguntas y renderizar la interfaz
function applyFiltersAndRender() {
    let result = [...AppStateQuestions.questions];

    // 1. Filtro por buscador de texto (en pregunta o respuesta)
    if (AppStateQuestions.filters.search) {
        const query = AppStateQuestions.filters.search;
        result = result.filter(q => 
            q.question.toLowerCase().includes(query) || 
            q.answer.toLowerCase().includes(query)
        );
    }

    // 2. Filtro por categoría
    if (AppStateQuestions.filters.category) {
        result = result.filter(q => q.category === AppStateQuestions.filters.category);
    }

    // 3. Filtro por dificultad
    if (AppStateQuestions.filters.difficulty) {
        result = result.filter(q => q.difficulty === AppStateQuestions.filters.difficulty);
    }

    AppStateQuestions.filteredQuestions = result;
    renderQuestionsAccordion();
}

// Dibujar el acordeón en el DOM
function renderQuestionsAccordion() {
    const accordion = document.getElementById('questions-accordion');
    const emptyState = document.getElementById('empty-state-questions');

    accordion.innerHTML = '';

    if (AppStateQuestions.filteredQuestions.length === 0) {
        accordion.classList.add('d-none');
        emptyState.classList.remove('d-none');
        return;
    }

    emptyState.classList.add('d-none');
    accordion.classList.remove('d-none');

    AppStateQuestions.filteredQuestions.forEach((q, index) => {
        // Encontrar empresa asociada si existe
        let associatedCompany = '';
        if (q.application_id) {
            const offer = AppStateQuestions.offers.find(o => String(o.id) === String(q.application_id));
            if (offer) {
                associatedCompany = offer.empresa;
            }
        }

        // Determinar badge de dificultad
        let diffClass = 'difficulty-facil';
        if (q.difficulty === 'Media') diffClass = 'difficulty-media';
        if (q.difficulty === 'Difícil') diffClass = 'difficulty-dificil';

        // Determinar badge de categoría
        const categoryBadgeClass = q.category === 'General' ? 'bg-indigo' : 'bg-cyan';

        const item = document.createElement('div');
        item.className = 'accordion-item animate-fade-in';
        
        // Estructura del item
        item.innerHTML = `
            <h3 class="accordion-header" id="heading-q-${q.id}">
                <button id="btn-accordion-q-${q.id}" class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-q-${q.id}" aria-expanded="false" aria-controls="collapse-q-${q.id}">
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center flex-grow-1 me-3 gap-2">
                        <span class="fw-semibold text-light text-start">${q.question}</span>
                        <span class="d-flex align-items-center gap-2 flex-wrap">
                            ${associatedCompany ? `<span class="badge badge-company fs-8" style="padding: 0.35em 0.7em;"><i class="bi bi-building me-1" aria-hidden="true"></i>${associatedCompany}</span>` : ''}
                            <span class="badge ${categoryBadgeClass} fs-8" style="padding: 0.35em 0.7em;">${q.category}</span>
                            <span class="difficulty-badge ${diffClass}">${q.difficulty}</span>
                        </span>
                    </div>
                </button>
            </h3>
            <div id="collapse-q-${q.id}" class="accordion-collapse collapse" aria-labelledby="heading-q-${q.id}" data-bs-parent="#questions-accordion">
                <div class="accordion-body">
                    <div class="prepared-answer-container" style="white-space: pre-wrap;">${q.answer}</div>
                    
                    <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top border-secondary" style="border-color: rgba(255,255,255,0.06) !important;">
                        <button id="btn-edit-q-${q.id}" type="button" class="btn btn-premium-secondary btn-sm fs-7 py-1 px-3 btn-edit-question">
                            <i class="bi bi-pencil me-1" aria-hidden="true"></i>Editar
                        </button>
                        <button id="btn-delete-q-${q.id}" type="button" class="btn btn-premium-danger btn-sm fs-7 py-1 px-3 btn-delete-question">
                            <i class="bi bi-trash me-1" aria-hidden="true"></i>Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Asignación de escuchadores de eventos programáticos
        item.querySelector('.btn-edit-question').addEventListener('click', () => {
            openQuestionModal(q.id);
        });

        item.querySelector('.btn-delete-question').addEventListener('click', () => {
            confirmDeleteQuestion(q.id);
        });

        accordion.appendChild(item);
    });
}

// Abrir modal de creación/edición de pregunta
function openQuestionModal(id = null) {
    const form = document.getElementById('form-question');
    form.reset();
    document.getElementById('question-id').value = '';
    document.getElementById('modalQuestionTitle').textContent = 'Registrar Pregunta de Entrevista';

    // Desmarcar clases inválidas
    document.getElementById('question-text').classList.remove('is-invalid');
    document.getElementById('question-answer').classList.remove('is-invalid');

    if (id) {
        const question = AppStateQuestions.questions.find(q => String(q.id) === String(id));
        if (question) {
            document.getElementById('modalQuestionTitle').textContent = 'Editar Pregunta de Entrevista';
            document.getElementById('question-id').value = question.id;
            document.getElementById('question-text').value = question.question;
            document.getElementById('question-answer').value = question.answer;
            document.getElementById('question-category').value = question.category || 'General';
            document.getElementById('question-difficulty').value = question.difficulty || 'Fácil';
            document.getElementById('question-offer-id').value = question.application_id || '';
        }
    }

    questionModal.show();
}

// Enviar formulario (Crear/Editar)
async function handleQuestionSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('question-id').value;
    const questionText = document.getElementById('question-text');
    const questionAnswer = document.getElementById('question-answer');
    const category = document.getElementById('question-category').value;
    const difficulty = document.getElementById('question-difficulty').value;
    const offerVal = document.getElementById('question-offer-id').value;

    questionText.classList.remove('is-invalid');
    questionAnswer.classList.remove('is-invalid');

    // Validación de obligatorios
    if (!questionText.value.trim() || !questionAnswer.value.trim()) {
        showToast('Por favor, rellena los campos obligatorios.', 'error');
        if (!questionText.value.trim()) questionText.classList.add('is-invalid');
        if (!questionAnswer.value.trim()) questionAnswer.classList.add('is-invalid');
        return;
    }

    const payload = {
        question: questionText.value.trim(),
        answer: questionAnswer.value.trim(),
        category: category,
        difficulty: difficulty,
        application_id: offerVal ? offerVal : null
    };

    const isEdit = id !== '';
    if (isEdit) {
        payload.id = id;
    }

    const apiPayload = {
        question_text: payload.question,
        answer_text: payload.answer,
        category: payload.category,
        difficulty: payload.difficulty,
        application_id: payload.application_id
    };
    if (isEdit) {
        apiPayload.id = id;
    }

    const btnSave = document.getElementById('btn-save-question');
    const spinner = document.getElementById('spinner-save-question');
    btnSave.disabled = true;
    spinner.classList.remove('d-none');

    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 
            'Content-Type': 'application/json' 
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const url = isEdit ? API_QUESTIONS_URLS.update : API_QUESTIONS_URLS.create;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(apiPayload)
        });
        if (response.status === 401) {
            Auth.logout();
            return;
        }

        if (response.ok) {
            const data = await response.json();
            showToast(isEdit ? 'Pregunta actualizada con éxito.' : 'Pregunta registrada con éxito.', 'success');
            questionModal.hide();
            loadQuestions();
        } else {
            throw new Error('Error de servidor en la operación.');
        }

    } catch (error) {
        console.warn('Error en la llamada de API, guardando en localStorage (Mock).');
        
        let localQuestions = JSON.parse(localStorage.getItem(getStorageKey(MOCK_QUESTIONS_KEY)) || '[]');

        if (isEdit) {
            localQuestions = localQuestions.map(q => String(q.id) === String(id) ? { ...q, ...payload } : q);
            showToast('Pregunta de entrevista actualizada localmente.', 'success');
        } else {
            const newId = 'local-q-' + Math.random().toString(36).substr(2, 9);
            localQuestions.push({ id: newId, ...payload });
            showToast('Pregunta de entrevista guardada localmente.', 'success');
        }

        localStorage.setItem(getStorageKey(MOCK_QUESTIONS_KEY), JSON.stringify(localQuestions));
        questionModal.hide();
        loadQuestions();
    } finally {
        btnSave.disabled = false;
        spinner.classList.add('d-none');
    }
}

// Disparar confirmación de borrado
function confirmDeleteQuestion(id) {
    AppStateQuestions.selectedQuestionId = id;
    confirmDeleteQuestionModal.show();
}

// Eliminar pregunta
async function deleteQuestion(id) {
    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 
            'Content-Type': 'application/json' 
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_QUESTIONS_URLS.delete}?id=${id}`, {
            method: 'DELETE',
            headers: headers
        });
        if (response.status === 401) {
            Auth.logout();
            return;
        }

        if (response.ok) {
            showToast('Pregunta de entrevista eliminada con éxito.', 'success');
            confirmDeleteQuestionModal.hide();
            loadQuestions();
        } else {
            throw new Error('Error al borrar de la base de datos.');
        }

    } catch (error) {
        console.warn('Error en la API de eliminación. Eliminando de localStorage mock.');
        
        let localQuestions = JSON.parse(localStorage.getItem(getStorageKey(MOCK_QUESTIONS_KEY)) || '[]');
        localQuestions = localQuestions.filter(q => String(q.id) !== String(id));
        localStorage.setItem(getStorageKey(MOCK_QUESTIONS_KEY), JSON.stringify(localQuestions));

        showToast('Pregunta de entrevista eliminada localmente.', 'success');
        confirmDeleteQuestionModal.hide();
        loadQuestions();
    }
}

// Controlar loader de carga
function showLoader(visible) {
    const spinner = document.getElementById('loading-spinner-questions');
    if (visible) {
        spinner.classList.remove('d-none');
    } else {
        spinner.classList.add('d-none');
    }
}

// Exportar funciones globales para los eventos onClick delegados del acordeón
window.openQuestionModal = openQuestionModal;
window.confirmDeleteQuestion = confirmDeleteQuestion;
