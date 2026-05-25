/* ==========================================================================
   JS Aplicaciones & CRUD - Registro de Ofertas de Empleo
   ========================================================================== */

// Configuración global del CRUD
const MOCK_OFFERS_KEY = 'job_tracker_offers';
const API_BASE_OFFERS = window.API_BASE_URL || 'servidor';
const API_OFFERS_URLS = {
    list: `${API_BASE_OFFERS}/applications.php`,
    create: `${API_BASE_OFFERS}/applications.php`,
    update: `${API_BASE_OFFERS}/applications.php`,
    delete: `${API_BASE_OFFERS}/applications.php`
};

// Estado global de la aplicación
const AppState = {
    offers: [],
    filteredOffers: [],
    currentPage: 1,
    itemsPerPage: 5,
    selectedOfferId: null,
    filters: {
        search: '',
        status: '',
        sort: 'fecha-desc'
    }
};

// Mock inicial si no hay datos
const INITIAL_MOCK_OFFERS = [
    {
        id: 'mock-1',
        empresa: 'Google',
        puesto: 'Senior Frontend Engineer',
        fecha_postulacion: '2026-05-15',
        estado: 'En proceso',
        salario: 85000,
        enlace: 'https://careers.google.com',
        notas: 'Entrevista de diseño de sistemas agendada. Repasar conceptos de arquitectura, caching y SSR.',
        fecha_entrevista: '2026-05-25',
        modalidad: 'Presencial',
        ubicacion: 'Paseo de la Castellana 30, Madrid, España',
        lat: 40.430076,
        lon: -3.689100
    },
    {
        id: 'mock-2',
        empresa: 'Stripe',
        puesto: 'Software Engineer - React',
        fecha_postulacion: '2026-05-22',
        estado: 'Postulado',
        salario: 72000,
        enlace: 'https://stripe.com/jobs',
        notas: 'Postulado a través de un contacto interno en LinkedIn. Esperando respuesta de RRHH.',
        fecha_entrevista: '',
        modalidad: 'Híbrido',
        ubicacion: 'Gran Vía 28, Madrid, España',
        lat: 40.419998,
        lon: -3.702560
    },
    {
        id: 'mock-3',
        empresa: 'Meta',
        puesto: 'Product Engineer (React)',
        fecha_postulacion: '2026-05-02',
        estado: 'Rechazado',
        salario: 95000,
        enlace: 'https://meta.com/careers',
        notas: 'Llegué a la ronda final técnica. El feedback fue positivo, pero seleccionaron a alguien con más experiencia en sistemas distribuidos.',
        fecha_entrevista: '2026-05-12',
        modalidad: 'Presencial',
        ubicacion: 'Plaza de la Independencia 1, Madrid, España',
        lat: 40.420188,
        lon: -3.688849
    },
    {
        id: 'mock-4',
        empresa: 'Vercel',
        puesto: 'Developer Relations Engineer',
        fecha_postulacion: '2026-05-08',
        estado: 'Aceptado',
        salario: 80000,
        enlace: 'https://vercel.com/careers',
        notas: '¡Oferta recibida! Excelente comunicación durante todo el proceso. Revisando términos del contrato.',
        fecha_entrevista: '2026-05-18',
        modalidad: 'Remoto',
        ubicacion: 'Remoto, España',
        lat: null,
        lon: null
    }
];

// Instancias de Modales Bootstrap
let offerModal;
let detailModal;
let confirmDeleteModal;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modales
    offerModal = new bootstrap.Modal(document.getElementById('modal-offer'));
    detailModal = new bootstrap.Modal(document.getElementById('modal-detail'));
    confirmDeleteModal = new bootstrap.Modal(document.getElementById('modal-confirm-delete'));

    // Configurar listeners
    initEventListeners();

    // Rellenar navbar con nombre
    const session = Auth.isAuthenticated();
    if (session && session.user) {
        document.getElementById('navbar-username').textContent = session.user.nombre;
    }

    // Cargar ofertas iniciales
    loadOffers();
});

// Registrar Listeners del UI
function initEventListeners() {
    // Botón "Nueva Postulación"
    document.getElementById('btn-new-offer').addEventListener('click', () => {
        openOfferModal();
    });
    
    // Botón "Nueva Postulación" en Empty State
    document.getElementById('btn-empty-add-offer').addEventListener('click', () => {
        openOfferModal();
    });

    // Envío del formulario de oferta
    document.getElementById('form-offer').addEventListener('submit', handleOfferSubmit);

    // Botón borrar dentro del modal detalle
    document.getElementById('btn-detail-delete').addEventListener('click', () => {
        if (AppState.selectedOfferId) {
            detailModal.hide();
            confirmDeleteModal.show();
        }
    });

    // Botón confirmar borrado en modal confirmación
    document.getElementById('btn-confirm-delete-action').addEventListener('click', () => {
        if (AppState.selectedOfferId) {
            deleteOffer(AppState.selectedOfferId);
        }
    });

    // Botón editar dentro del modal detalle
    document.getElementById('btn-detail-edit').addEventListener('click', () => {
        if (AppState.selectedOfferId) {
            detailModal.hide();
            openOfferModal(AppState.selectedOfferId);
        }
    });

    // Input de búsqueda (Filtrado interactivo con debounce simple)
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            AppState.filters.search = e.target.value.trim().toLowerCase();
            AppState.currentPage = 1;
            applyFiltersAndRender();
        }, 300);
    });

    // Filtro por Estado
    document.getElementById('filter-status').addEventListener('change', (e) => {
        AppState.filters.status = e.target.value;
        AppState.currentPage = 1;
        applyFiltersAndRender();
    });

    // Selector de Ordenación
    document.getElementById('sort-select').addEventListener('change', (e) => {
        AppState.filters.sort = e.target.value;
        applyFiltersAndRender();
    });

    // Botones de Paginación
    document.getElementById('btn-page-prev').addEventListener('click', (e) => {
        e.preventDefault();
        if (AppState.currentPage > 1) {
            AppState.currentPage--;
            renderOffersTable();
        }
    });

    document.getElementById('btn-page-next').addEventListener('click', (e) => {
        e.preventDefault();
        const totalPages = Math.ceil(AppState.filteredOffers.length / AppState.itemsPerPage);
        if (AppState.currentPage < totalPages) {
            AppState.currentPage++;
            renderOffersTable();
        }
    });

    // Botón de salir
    document.getElementById('btn-logout').addEventListener('click', () => {
        Auth.logout();
    });

    // Stats cards click filters for premium interactivity
    const statCards = [
        { id: 'card-stat-total', status: '' },
        { id: 'card-stat-process', status: 'En proceso' },
        { id: 'card-stat-accepted', status: 'Aceptado' },
        { id: 'card-stat-rejected', status: 'Rechazado' }
    ];

    statCards.forEach(cardInfo => {
        const el = document.getElementById(cardInfo.id);
        if (el) {
            const selectStatus = document.getElementById('filter-status');
            const handler = () => {
                AppState.filters.status = cardInfo.status;
                if (selectStatus) {
                    selectStatus.value = cardInfo.status;
                }
                AppState.currentPage = 1;
                applyFiltersAndRender();
            };
            el.addEventListener('click', handler);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handler();
                }
            });
        }
    });
}

// Cargar listado desde API o Local Mock
async function loadOffers() {
    showLoader(true);
    
    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_OFFERS_URLS.list, { headers });
        if (response.ok) {
            const data = await response.json();
            // Mapear los datos de BD a las claves que espera el frontend
            AppState.offers = (data || []).map(o => ({
                id: o.id,
                empresa: o.company,
                puesto: o.title,
                fecha_postulacion: o.date_applied,
                estado: o.status,
                salario: o.salario || null, // Guardado si existe
                enlace: o.url || '',
                notas: o.description || '',
                modalidad: o.modalidad || 'Presencial',
                ubicacion: o.ubicacion_nombre || '',
                lat: o.latitud ? parseFloat(o.latitud) : null,
                lon: o.longitud ? parseFloat(o.longitud) : null,
                fecha_entrevista: ''
            }));
            
            // Intentar cargar la fecha de entrevista desde los eventos
            try {
                const evResponse = await fetch(`${window.API_BASE_URL || 'servidor'}/events.php`, { headers });
                if (evResponse.ok) {
                    const evData = await evResponse.json();
                    evData.forEach(ev => {
                        if (ev.type === 'Entrevista' && ev.application_id) {
                            const offer = AppState.offers.find(o => String(o.id) === String(ev.application_id));
                            if (offer) {
                                offer.fecha_entrevista = ev.event_date.split(' ')[0];
                            }
                        }
                    });
                }
            } catch (evErr) {
                console.warn('No se pudieron cargar las fechas de entrevista desde los eventos:', evErr);
            }
        } else {
            throw new Error('No se pudo conectar con la API de PHP');
        }
    } catch (error) {
        console.warn('Usando base de datos local para ofertas (Fallback LocalStorage).');
        
        let localData = localStorage.getItem(MOCK_OFFERS_KEY);
        if (!localData) {
            // Guardar ofertas demo la primera vez
            localStorage.setItem(MOCK_OFFERS_KEY, JSON.stringify(INITIAL_MOCK_OFFERS));
            localData = JSON.stringify(INITIAL_MOCK_OFFERS);
        }
        
        AppState.offers = JSON.parse(localData);
    }

    showLoader(false);
    applyFiltersAndRender();
    
    // Notificar al calendario que refresque
    if (window.CalendarInstance) {
        window.CalendarInstance.refreshCalendar();
    }
}

// Aplicar filtros de búsqueda, estado y ordenamiento
function applyFiltersAndRender() {
    let result = [...AppState.offers];

    // 1. Filtro de búsqueda
    if (AppState.filters.search) {
        const query = AppState.filters.search;
        result = result.filter(o => 
            o.empresa.toLowerCase().includes(query) || 
            o.puesto.toLowerCase().includes(query) ||
            (o.notas && o.notas.toLowerCase().includes(query))
        );
    }

    // 2. Filtro de estado
    if (AppState.filters.status) {
        result = result.filter(o => o.estado === AppState.filters.status);
    }

    // 3. Ordenamiento
    result.sort((a, b) => {
        if (AppState.filters.sort === 'fecha-desc') {
            return new Date(b.fecha_postulacion) - new Date(a.fecha_postulacion);
        } else if (AppState.filters.sort === 'fecha-asc') {
            return new Date(a.fecha_postulacion) - new Date(b.fecha_postulacion);
        } else if (AppState.filters.sort === 'empresa-asc') {
            return a.empresa.localeCompare(b.empresa);
        } else if (AppState.filters.sort === 'salario-desc') {
            const salA = parseFloat(a.salario) || 0;
            const salB = parseFloat(b.salario) || 0;
            return salB - salA;
        }
        return 0;
    });

    AppState.filteredOffers = result;
    
    // Recalcular métricas
    renderStats();
    
    // Actualizar clase activa en las tarjetas de estadísticas
    const statCardsMap = {
        '': 'card-stat-total',
        'En proceso': 'card-stat-process',
        'Aceptado': 'card-stat-accepted',
        'Rechazado': 'card-stat-rejected'
    };

    Object.entries(statCardsMap).forEach(([statusVal, cardId]) => {
        const el = document.getElementById(cardId);
        if (el) {
            if (AppState.filters.status === statusVal) {
                el.classList.add('active-filter');
            } else {
                el.classList.remove('active-filter');
            }
        }
    });

    // Pintar la tabla
    renderOffersTable();
}

// Pintar tabla con paginación
function renderOffersTable() {
    const tbody = document.getElementById('offers-tbody');
    const table = document.getElementById('offers-table');
    const cardsContainer = document.getElementById('offers-cards');
    const emptyState = document.getElementById('empty-state');
    const pagination = document.getElementById('pagination-container');

    tbody.innerHTML = '';
    if (cardsContainer) {
        cardsContainer.innerHTML = '';
    }

    if (AppState.filteredOffers.length === 0) {
        table.classList.add('d-none');
        if (cardsContainer) cardsContainer.classList.add('d-none');
        pagination.classList.add('d-none');
        emptyState.classList.remove('d-none');
        return;
    }

    emptyState.classList.add('d-none');
    table.classList.remove('d-none');
    if (cardsContainer) {
        cardsContainer.classList.remove('d-none');
    }

    // Calcular páginas
    const totalItems = AppState.filteredOffers.length;
    const totalPages = Math.ceil(totalItems / AppState.itemsPerPage);
    
    if (AppState.currentPage > totalPages) {
        AppState.currentPage = Math.max(1, totalPages);
    }

    const startIndex = (AppState.currentPage - 1) * AppState.itemsPerPage;
    const endIndex = Math.min(startIndex + AppState.itemsPerPage, totalItems);
    const paginatedItems = AppState.filteredOffers.slice(startIndex, endIndex);

    // Renderizar filas y tarjetas móviles con efectos visuales suaves
    paginatedItems.forEach(offer => {
        // --- 1. Fila de la Tabla (Escritorio/Tablet) ---
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.className = 'animate-fade-in';
        
        // Determinar badge según estado
        let badgeClass = 'badge-postulado';
        if (offer.estado === 'En proceso') badgeClass = 'badge-proceso';
        if (offer.estado === 'Aceptado') badgeClass = 'badge-aceptado';
        if (offer.estado === 'Rechazado') badgeClass = 'badge-rechazado';

        // Determinar badge según modalidad
        let modalityBadgeClass = 'badge-presencial';
        if (offer.modalidad === 'Híbrido') modalityBadgeClass = 'badge-hibrido';
        if (offer.modalidad === 'Remoto') modalityBadgeClass = 'badge-remoto';
        const modalityLabel = offer.modalidad || 'Presencial';

        const logoLetter = offer.empresa ? offer.empresa.charAt(0).toUpperCase() : '?';
        const formattedSalary = offer.salario ? `${parseFloat(offer.salario).toLocaleString('es-ES')} €` : 'No esp.';
        
        // Formatear Fecha
        const dateObj = new Date(offer.fecha_postulacion);
        const formattedDate = !isNaN(dateObj.getTime()) 
            ? dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : offer.fecha_postulacion;

        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold text-light">${offer.empresa}</span>
                    <span class="badge ${modalityBadgeClass}" style="font-size: 0.65rem; padding: 0.25em 0.5em; text-transform: none;">${modalityLabel}</span>
                </div>
            </td>
            <td>${offer.puesto}</td>
            <td>
                <i class="bi bi-calendar-event me-2 text-secondary"></i>${formattedDate}
            </td>
            <td>
                <span class="fw-semibold text-secondary">${formattedSalary}</span>
            </td>
            <td>
                <span class="badge badge-status ${badgeClass}">${offer.estado}</span>
            </td>
            <td class="text-end">
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-secondary border-0 py-1 btn-edit-offer" title="Editar">
                        <i class="bi bi-pencil text-warning" style="font-size: 1.1rem;"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary border-0 py-1 btn-delete-offer" title="Eliminar">
                        <i class="bi bi-trash text-danger" style="font-size: 1.1rem;"></i>
                    </button>
                </div>
            </td>
        `;

        // Click en fila para abrir detalle
        tr.addEventListener('click', () => {
            openDetailModal(offer.id);
        });

        // Click listeners programáticos para botones de la fila
        tr.querySelector('.btn-edit-offer').addEventListener('click', (e) => {
            e.stopPropagation();
            openOfferModal(offer.id);
        });

        tr.querySelector('.btn-delete-offer').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDelete(offer.id);
        });

        tbody.appendChild(tr);

        // --- 2. Tarjetas para Dispositivos Móviles (<768px) ---
        if (cardsContainer) {
            const card = document.createElement('div');
            card.className = 'mobile-offer-card glass-container animate-fade-in mb-3';
            card.style.cursor = 'pointer';
            
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold text-light">${offer.empresa}</span>
                        <span class="badge badge-status ${modalityBadgeClass}" style="font-size: 0.65rem; padding: 0.25em 0.5em; text-transform: none;">${modalityLabel}</span>
                    </div>
                    <span class="badge badge-status ${badgeClass}" style="font-size: 0.7rem;">${offer.estado}</span>
                </div>
                <div class="mb-2">
                    <div class="text-secondary fs-7 fw-semibold">${offer.puesto}</div>
                </div>
                <div class="d-flex justify-content-between text-secondary fs-8 mb-3">
                    <span><i class="bi bi-calendar-event me-1"></i>${formattedDate}</span>
                    <span><i class="bi bi-currency-euro me-1"></i>${formattedSalary}</span>
                </div>
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-premium-secondary py-1 px-2 fs-8 btn-edit-offer-mobile" aria-label="Editar postulación de ${offer.empresa}">
                        <i class="bi bi-pencil text-warning me-1"></i>Editar
                    </button>
                    <button class="btn btn-sm btn-premium-secondary py-1 px-2 fs-8 btn-delete-offer-mobile" aria-label="Eliminar postulación de ${offer.empresa}">
                        <i class="bi bi-trash text-danger me-1"></i>Borrar
                    </button>
                </div>
            `;
            
            card.addEventListener('click', () => {
                openDetailModal(offer.id);
            });

            // Click listeners programáticos para botones de la tarjeta móvil
            card.querySelector('.btn-edit-offer-mobile').addEventListener('click', (e) => {
                e.stopPropagation();
                openOfferModal(offer.id);
            });

            card.querySelector('.btn-delete-offer-mobile').addEventListener('click', (e) => {
                e.stopPropagation();
                confirmDelete(offer.id);
            });
            
            cardsContainer.appendChild(card);
        }
    });

    // Actualizar paginador
    if (totalPages > 1) {
        pagination.classList.remove('d-none');
        document.getElementById('pagination-info').textContent = `Mostrando ${startIndex + 1}-${endIndex} de ${totalItems} ofertas`;
        document.getElementById('current-page-num').textContent = AppState.currentPage;
        
        // Habilitar/deshabilitar controles
        document.getElementById('btn-page-prev').classList.toggle('disabled', AppState.currentPage === 1);
        document.getElementById('btn-page-next').classList.toggle('disabled', AppState.currentPage === totalPages);
    } else {
        pagination.classList.add('d-none');
    }
}

// Calcular y pintar contadores de estadísticas
function renderStats() {
    const counts = {
        total: AppState.offers.length,
        proceso: 0,
        aceptado: 0,
        rechazado: 0
    };

    AppState.offers.forEach(o => {
        if (o.estado === 'En proceso') counts.proceso++;
        if (o.estado === 'Aceptado') counts.aceptado++;
        if (o.estado === 'Rechazado') counts.rechazado++;
    });

    document.getElementById('stat-total').textContent = counts.total;
    document.getElementById('stat-process').textContent = counts.proceso;
    document.getElementById('stat-accepted').textContent = counts.aceptado;
    document.getElementById('stat-rejected').textContent = counts.rechazado;
}

// Abrir modal de creación/edición de oferta
function openOfferModal(id = null) {
    const form = document.getElementById('form-offer');
    form.reset();
    document.getElementById('offer-id').value = '';
    
    // Título por defecto
    document.getElementById('modalOfferTitle').textContent = 'Registrar Nueva Postulación';

    if (id) {
        const offer = AppState.offers.find(o => String(o.id) === String(id));
        if (offer) {
            document.getElementById('modalOfferTitle').textContent = 'Editar Postulación';
            document.getElementById('offer-id').value = offer.id;
            document.getElementById('offer-empresa').value = offer.empresa;
            document.getElementById('offer-puesto').value = offer.puesto;
            document.getElementById('offer-fecha').value = offer.fecha_postulacion;
            document.getElementById('offer-estado').value = offer.estado;
            document.getElementById('offer-salario').value = offer.salario || '';
            document.getElementById('offer-enlace').value = offer.enlace || '';
            document.getElementById('offer-notas').value = offer.notas || '';
            document.getElementById('offer-fecha-entrevista').value = offer.fecha_entrevista || '';
            document.getElementById('offer-modalidad').value = offer.modalidad || 'Presencial';
            document.getElementById('offer-ubicacion').value = offer.ubicacion || '';
        }
    } else {
        // Inicializar la fecha del formulario al día de hoy
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('offer-fecha').value = today;
        document.getElementById('offer-modalidad').value = 'Presencial';
        document.getElementById('offer-ubicacion').value = '';
    }

    offerModal.show();
}

// Guardar / Actualizar Oferta (Form Submit)
async function handleOfferSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('offer-id').value;
    const empresaInput = document.getElementById('offer-empresa');
    const puestoInput = document.getElementById('offer-puesto');
    const fechaInput = document.getElementById('offer-fecha');

    // Quitar clases inválidas
    empresaInput.classList.remove('is-invalid');
    puestoInput.classList.remove('is-invalid');
    fechaInput.classList.remove('is-invalid');

    if (!empresaInput.value.trim() || !puestoInput.value.trim() || !fechaInput.value) {
        showToast('Por favor, rellena todos los campos obligatorios.', 'error');
        if (!empresaInput.value.trim()) empresaInput.classList.add('is-invalid');
        if (!puestoInput.value.trim()) puestoInput.classList.add('is-invalid');
        if (!fechaInput.value) fechaInput.classList.add('is-invalid');
        return;
    }

    const modalityValue = document.getElementById('offer-modalidad').value;
    const ubicacionValue = document.getElementById('offer-ubicacion').value.trim();

    let lat = null;
    let lon = null;
    if (modalityValue !== 'Remoto' && ubicacionValue) {
        try {
            const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ubicacionValue)}&format=json&limit=1`;
            const geoRes = await fetch(geocodeUrl, {
                headers: {
                    'Accept-Language': 'es',
                    'User-Agent': 'JobTrackerApp/1.0'
                }
            });
            if (geoRes.ok) {
                const geoData = await geoRes.json();
                if (geoData && geoData.length > 0) {
                    lat = parseFloat(geoData[0].lat);
                    lon = parseFloat(geoData[0].lon);
                }
            }
        } catch (err) {
            console.error('Error al geolocalizar dirección con Nominatim:', err);
        }
    }

    const payload = {
        empresa: empresaInput.value.trim(),
        puesto: puestoInput.value.trim(),
        fecha_postulacion: fechaInput.value,
        estado: document.getElementById('offer-estado').value,
        salario: document.getElementById('offer-salario').value ? parseFloat(document.getElementById('offer-salario').value) : null,
        enlace: document.getElementById('offer-enlace').value.trim(),
        notas: document.getElementById('offer-notas').value.trim(),
        fecha_entrevista: document.getElementById('offer-fecha-entrevista').value,
        modalidad: modalityValue,
        ubicacion: ubicacionValue,
        lat: lat,
        lon: lon
    };

    const isEdit = id !== '';
    if (isEdit) {
        payload.id = id;
    }

    const btnSave = document.getElementById('btn-save-offer');
    const spinner = document.getElementById('spinner-save-offer');
    btnSave.disabled = true;
    spinner.classList.remove('d-none');

    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const apiPayload = {
            company: payload.empresa,
            title: payload.puesto,
            date_applied: payload.fecha_postulacion,
            status: payload.estado,
            salario: payload.salario,
            url: payload.enlace,
            description: payload.notas,
            modalidad: payload.modalidad,
            ubicacion_nombre: payload.ubicacion,
            latitud: payload.lat,
            longitud: payload.lon
        };

        const url = isEdit 
            ? `${API_OFFERS_URLS.update}?id=${id}` 
            : API_OFFERS_URLS.create;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(apiPayload)
        });

        if (response.ok) {
            const data = await response.json();
            
            // Si hay una fecha de entrevista, crear un evento de entrevista automáticamente
            if (payload.fecha_entrevista) {
                try {
                    const appId = isEdit ? id : data.id;
                    const evPayload = {
                        application_id: appId ? parseInt(appId) : null,
                        title: `Entrevista en ${payload.empresa}`,
                        type: 'Entrevista',
                        event_date: `${payload.fecha_entrevista} 10:00:00`,
                        description: 'Entrevista programada automáticamente desde la ficha de la postulación.'
                    };
                    await fetch(`${window.API_BASE_URL || 'servidor'}/events.php`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(evPayload)
                    });
                } catch (evErr) {
                    console.error('Error al registrar evento de entrevista:', evErr);
                }
            }

            showToast(isEdit ? 'Postulación actualizada con éxito.' : 'Nueva postulación creada con éxito.', 'success');
            offerModal.hide();
            loadOffers();
        } else {
            throw new Error('Sin conexión con el servidor o error en la petición');
        }
    } catch (error) {
        console.warn('Error en la llamada de API, realizando guardado en localStorage mock.');
        
        // Lógica de fallback local
        let localOffers = JSON.parse(localStorage.getItem(MOCK_OFFERS_KEY) || '[]');
        
        if (isEdit) {
            localOffers = localOffers.map(o => String(o.id) === String(id) ? { ...o, ...payload } : o);
            // Si el estado cambia a "Rechazado" o "Aceptado", u otros, revisar si hay entrevistas agendadas
            showToast('Postulación actualizada en base de datos local (Mock).', 'success');
        } else {
            const newId = 'local-' + Math.random().toString(36).substr(2, 9);
            const newOffer = { id: newId, ...payload };
            localOffers.push(newOffer);
            showToast('Postulación agregada a base de datos local (Mock).', 'success');
        }
        
        localStorage.setItem(MOCK_OFFERS_KEY, JSON.stringify(localOffers));
        offerModal.hide();
        loadOffers();
    } finally {
        btnSave.disabled = false;
        spinner.classList.add('d-none');
    }
}

// Abrir detalle modal
function openDetailModal(id) {
    const offer = AppState.offers.find(o => String(o.id) === String(id));
    if (!offer) return;

    AppState.selectedOfferId = id;

    document.getElementById('detail-empresa').textContent = offer.empresa;
    document.getElementById('detail-puesto').textContent = offer.puesto;
    
    // Formatear Fecha Postulación
    const dateObj = new Date(offer.fecha_postulacion);
    const formattedDate = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
        : offer.fecha_postulacion;
    document.getElementById('detail-fecha').textContent = formattedDate;

    // Salario
    document.getElementById('detail-salario').textContent = offer.salario 
        ? `${parseFloat(offer.salario).toLocaleString('es-ES')} € / anuales`
        : 'No especificado';

    // Notas
    document.getElementById('detail-notas').textContent = offer.notas || 'Sin notas adicionales.';

    // Enlace
    const enlaceContainer = document.getElementById('detail-enlace');
    if (offer.enlace) {
        enlaceContainer.innerHTML = `
            <a href="${offer.enlace}" target="_blank" class="text-gradient-cyan text-decoration-none fw-semibold">
                <i class="bi bi-box-arrow-up-right me-1"></i>Ver oferta original
            </a>
        `;
    } else {
        enlaceContainer.innerHTML = '<span class="text-secondary text-muted">No especificado</span>';
    }

    // Modalidad
    const detailModalidad = document.getElementById('detail-modalidad');
    if (detailModalidad) {
        let modalBadgeClass = 'badge-presencial';
        if (offer.modalidad === 'Híbrido') modalBadgeClass = 'badge-hibrido';
        if (offer.modalidad === 'Remoto') modalBadgeClass = 'badge-remoto';
        detailModalidad.innerHTML = `<span class="badge badge-status ${modalBadgeClass}" style="text-transform: none;">${offer.modalidad || 'Presencial'}</span>`;
    }

    // Dirección / Ubicación
    const detailUbicacion = document.getElementById('detail-ubicacion');
    if (detailUbicacion) {
        detailUbicacion.textContent = offer.ubicacion || 'No especificada';
    }

    // Entrevista
    const entrevistaField = document.getElementById('detail-field-entrevista');
    const entrevistaVal = document.getElementById('detail-fecha-entrevista');
    if (offer.fecha_entrevista) {
        const interviewDate = new Date(offer.fecha_entrevista);
        const formattedInterview = !isNaN(interviewDate.getTime())
            ? interviewDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : offer.fecha_entrevista;
        
        entrevistaVal.textContent = formattedInterview;
        entrevistaVal.className = 'detail-val text-warning fw-semibold';
        entrevistaField.classList.remove('d-none');
    } else {
        entrevistaVal.textContent = 'No programada';
        entrevistaVal.className = 'detail-val text-secondary text-muted';
    }

    // Badge de Estado
    const badge = document.getElementById('detail-estado-badge');
    badge.textContent = offer.estado;
    badge.className = 'badge badge-status';
    
    if (offer.estado === 'Postulado') badge.classList.add('badge-postulado');
    if (offer.estado === 'En proceso') badge.classList.add('badge-proceso');
    if (offer.estado === 'Aceptado') badge.classList.add('badge-aceptado');
    if (offer.estado === 'Rechazado') badge.classList.add('badge-rechazado');

    detailModal.show();
}

// Disparar confirmación de borrado
function confirmDelete(id) {
    AppState.selectedOfferId = id;
    confirmDeleteModal.show();
}

// Eliminar Oferta de Empleo
async function deleteOffer(id) {
    try {
        const session = Auth.isAuthenticated();
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_OFFERS_URLS.delete}?id=${id}`, {
            method: 'DELETE',
            headers: headers
        });

        if (response.ok) {
            showToast('Postulación eliminada con éxito.', 'success');
            confirmDeleteModal.hide();
            loadOffers();
        } else {
            throw new Error('Servidor no disponible o error al eliminar');
        }
    } catch (error) {
        console.warn('Error al eliminar en la API, borrando localmente.');
        
        let localOffers = JSON.parse(localStorage.getItem(MOCK_OFFERS_KEY) || '[]');
        localOffers = localOffers.filter(o => String(o.id) !== String(id));
        localStorage.setItem(MOCK_OFFERS_KEY, JSON.stringify(localOffers));

        // Borrar eventos asociados también
        let localEvents = JSON.parse(localStorage.getItem('job_tracker_events') || '[]');
        localEvents = localEvents.filter(ev => String(ev.oferta_id) !== String(id));
        localStorage.setItem('job_tracker_events', JSON.stringify(localEvents));

        showToast('Postulación eliminada localmente.', 'success');
        confirmDeleteModal.hide();
        loadOffers();
    }
}

// Controlar visualización del loader
function showLoader(visible) {
    const spinner = document.getElementById('loading-spinner');
    if (visible) {
        spinner.classList.remove('d-none');
    } else {
        spinner.classList.add('d-none');
    }
}

// Hacer globales funciones necesarias para onClick de las tablas y botones
window.openOfferModal = openOfferModal;
window.openDetailModal = openDetailModal;
window.confirmDelete = confirmDelete;
window.AppState = AppState;
