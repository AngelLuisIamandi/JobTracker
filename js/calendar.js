/* ==========================================================================
   JS Calendario Interactivo - Registro de Ofertas de Empleo
   ========================================================================== */

const MOCK_EVENTS_KEY = 'job_tracker_events';
const API_BASE_CALENDAR = window.API_BASE_URL || 'servidor';
const API_EVENTS_URLS = {
    list: `${API_BASE_CALENDAR}/events.php`,
    create: `${API_BASE_CALENDAR}/events.php`
};

// Estado del Calendario
const CalendarState = {
    currentDate: new Date(),
    events: [],
    linkedOffers: []
};

// Eventos Mock iniciales sincronizados con las postulaciones demo
const INITIAL_MOCK_EVENTS = [
    {
        id: 'ev-1',
        oferta_id: 'mock-1',
        titulo: 'Diseño de Sistemas con Team Lead',
        tipo: 'Entrevista',
        fecha: '2026-05-25',
        hora: '16:00',
        descripcion: 'Entrevista online vía Google Meet. Entrevistador: John Doe. Repasar escalabilidad y microservicios.'
    },
    {
        id: 'ev-2',
        oferta_id: 'mock-4',
        titulo: 'Presentación de Prueba Técnica',
        tipo: 'Prueba Técnica',
        fecha: '2026-05-18',
        hora: '10:00',
        descripcion: 'Presentar demo de la SPA construida con Next.js y Tailwind. Duración: 45 min.'
    },
    {
        id: 'ev-3',
        oferta_id: 'mock-2',
        titulo: 'Llamada de Filtro RRHH',
        tipo: 'Reunión',
        fecha: '2026-05-28',
        hora: '11:30',
        descripcion: 'Llamada introductoria con recruiter de Stripe para comentar expectativas salariales y encaje técnico.'
    }
];

// Nombres de meses en español
const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar el objeto global del calendario
    window.CalendarInstance = new JobTrackerCalendar();
});

class JobTrackerCalendar {
    constructor() {
        this.initElements();
        this.initListeners();
        this.loadEvents().then(() => {
            this.render();
        });
    }

    initElements() {
        this.monthYearEl = document.getElementById('calendar-month-year');
        this.daysGridEl = document.getElementById('calendar-days-grid');
        this.btnPrevMonth = document.getElementById('btn-prev-month');
        this.btnNextMonth = document.getElementById('btn-next-month');
        this.upcomingEventsEl = document.getElementById('calendar-upcoming-events');
        this.btnNewEventTrigger = document.getElementById('btn-new-event-trigger');
        
        // Modal de eventos
        this.eventModalEl = document.getElementById('modal-event');
        this.eventModal = new bootstrap.Modal(this.eventModalEl);
        this.formEvent = document.getElementById('form-event');
        this.selectOferta = document.getElementById('event-oferta-id');

        // Modal de eventos del día
        this.dayEventsModalEl = document.getElementById('modal-day-events');
        if (this.dayEventsModalEl) {
            this.dayEventsModal = new bootstrap.Modal(this.dayEventsModalEl);
            this.dayEventsDateEl = document.getElementById('modal-day-events-date');
            this.dayEventsListEl = document.getElementById('modal-day-events-list');
            this.btnAddEventFromDay = document.getElementById('btn-add-event-from-day');
        }
    }

    initListeners() {
        // Navegación de meses
        this.btnPrevMonth.addEventListener('click', () => {
            CalendarState.currentDate.setMonth(CalendarState.currentDate.getMonth() - 1);
            this.render();
        });

        this.btnNextMonth.addEventListener('click', () => {
            CalendarState.currentDate.setMonth(CalendarState.currentDate.getMonth() + 1);
            this.render();
        });

        // Trigger para abrir modal de agendar evento
        this.btnNewEventTrigger.addEventListener('click', () => {
            this.openEventForm();
        });

        // Evento de Envío del Formulario
        this.formEvent.addEventListener('submit', (e) => this.handleEventSubmit(e));
        
        // Al abrir el modal de eventos, rellenar el selector de ofertas
        this.eventModalEl.addEventListener('show.bs.modal', () => {
            this.populateOffersDropdown();
        });

        // Click en añadir evento desde el modal del día
        if (this.btnAddEventFromDay) {
            this.btnAddEventFromDay.addEventListener('click', () => {
                if (this.dayEventsModal) {
                    this.dayEventsModal.hide();
                }
                this.openEventForm(this.selectedDateForNewEvent);
            });
        }
    }

    // Cargar Eventos desde API o LocalStorage
    async loadEvents() {
        try {
            const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
            const token = session ? session.token : '';
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(API_EVENTS_URLS.list, { headers });
            if (response.ok) {
                const data = await response.json();
                
                // Mapear los datos de BD a las claves que espera el frontend
                CalendarState.events = (data || []).map(ev => {
                    const parts = ev.event_date.split(' ');
                    const fecha = parts[0];
                    const hora = parts[1] ? parts[1].substring(0, 5) : '00:00';
                    return {
                        id: ev.id,
                        oferta_id: ev.application_id,
                        titulo: ev.title,
                        tipo: ev.type,
                        fecha: fecha,
                        hora: hora,
                        descripcion: ev.description || ''
                    };
                });
            } else {
                throw new Error('Servidor no disponible');
            }
        } catch (error) {
            console.warn('Cargando eventos desde base de datos local (Mock localStorage).');
            let localEvents = localStorage.getItem(MOCK_EVENTS_KEY);
            if (!localEvents) {
                localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(INITIAL_MOCK_EVENTS));
                localEvents = JSON.stringify(INITIAL_MOCK_EVENTS);
            }
            CalendarState.events = JSON.parse(localEvents);
        }
    }

    // Obtener todas las ofertas disponibles para vincular eventos
    getOffers() {
        // Acceder al estado de AppState en js/app.js
        if (window.AppState && window.AppState.offers) {
            return window.AppState.offers;
        }
        // Fallback si no está cargado js/app.js
        const localOffers = localStorage.getItem('job_tracker_offers');
        return localOffers ? JSON.parse(localOffers) : [];
    }

    // Rellenar dropdown del modal con las ofertas existentes
    populateOffersDropdown() {
        const offers = this.getOffers();
        this.selectOferta.innerHTML = '<option value="" disabled selected>Selecciona una postulación...</option>';
        
        if (offers.length === 0) {
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = 'No hay postulaciones creadas. Regístrala primero.';
            this.selectOferta.appendChild(opt);
            return;
        }

        offers.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = `${o.empresa} - ${o.puesto} (${o.estado})`;
            this.selectOferta.appendChild(opt);
        });
    }

    // Abrir Formulario para nuevo evento pre-completando campos
    openEventForm(selectedDate = null) {
        this.formEvent.reset();
        
        // Ajustar fecha inicial
        const dateInput = document.getElementById('event-fecha');
        if (selectedDate) {
            dateInput.value = selectedDate;
        } else {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }

        this.eventModal.show();
    }

    // Enviar formulario de Evento
    async handleEventSubmit(e) {
        e.preventDefault();

        const ofertaIdInput = this.selectOferta;
        const tituloInput = document.getElementById('event-titulo');
        const tipoInput = document.getElementById('event-tipo');
        const fechaInput = document.getElementById('event-fecha');
        const horaInput = document.getElementById('event-hora');
        const descInput = document.getElementById('event-desc');

        // Validaciones
        ofertaIdInput.classList.remove('is-invalid');
        tituloInput.classList.remove('is-invalid');
        fechaInput.classList.remove('is-invalid');
        horaInput.classList.remove('is-invalid');

        let hasError = false;
        if (!ofertaIdInput.value) {
            ofertaIdInput.classList.add('is-invalid');
            hasError = true;
        }
        if (!tituloInput.value.trim()) {
            tituloInput.classList.add('is-invalid');
            hasError = true;
        }
        if (!fechaInput.value) {
            fechaInput.classList.add('is-invalid');
            hasError = true;
        }
        if (!horaInput.value) {
            horaInput.classList.add('is-invalid');
            hasError = true;
        }

        if (hasError) {
            showToast('Por favor, rellena todos los campos obligatorios.', 'error');
            return;
        }

        const payload = {
            oferta_id: ofertaIdInput.value,
            titulo: tituloInput.value.trim(),
            tipo: tipoInput.value,
            fecha: fechaInput.value,
            hora: horaInput.value,
            descripcion: descInput.value.trim()
        };

        const btnSave = document.getElementById('btn-save-event');
        const spinner = document.getElementById('spinner-save-event');
        btnSave.disabled = true;
        spinner.classList.remove('d-none');

        try {
            const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
            const token = session ? session.token : '';
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const apiPayload = {
                application_id: payload.oferta_id ? parseInt(payload.oferta_id) : null,
                title: payload.titulo,
                type: payload.tipo,
                event_date: `${payload.fecha} ${payload.hora}:00`,
                description: payload.descripcion
            };

            const response = await fetch(API_EVENTS_URLS.create, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(apiPayload)
            });

            if (response.ok) {
                const data = await response.json();
                showToast('Evento agendado con éxito.', 'success');
                this.eventModal.hide();
                await this.loadEvents();
                this.render();
            } else {
                throw new Error('Servidor no disponible o error al guardar');
            }
        } catch (error) {
            console.warn('Guardando evento localmente (Mock localStorage).');
            
            // Simular guardado local
            let localEvents = JSON.parse(localStorage.getItem(MOCK_EVENTS_KEY) || '[]');
            const newEvent = {
                id: 'local-ev-' + Math.random().toString(36).substr(2, 9),
                ...payload
            };
            localEvents.push(newEvent);
            localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(localEvents));
            
            // Si el tipo es entrevista, actualizar opcionalmente la fecha de entrevista en la oferta asociada
            if (payload.tipo === 'Entrevista') {
                let localOffers = JSON.parse(localStorage.getItem('job_tracker_offers') || '[]');
                localOffers = localOffers.map(o => {
                    if (String(o.id) === String(payload.oferta_id)) {
                        return { ...o, fecha_entrevista: payload.fecha, estado: 'En proceso' };
                    }
                    return o;
                });
                localStorage.setItem('job_tracker_offers', JSON.stringify(localOffers));
                
                // Si la función loadOffers del CRUD existe, llamarla para sincronizar
                if (window.loadOffers) {
                    window.loadOffers();
                }
            }

            showToast('Evento agendado localmente.', 'success');
            this.eventModal.hide();
            await this.loadEvents();
            this.render();
        } finally {
            btnSave.disabled = false;
            spinner.classList.add('d-none');
        }
    }

    // Refrescar calendario desde fuera
    async refreshCalendar() {
        await this.loadEvents();
        this.render();
    }

    // Renderizar Calendario y Agenda
    render() {
        const year = CalendarState.currentDate.getFullYear();
        const month = CalendarState.currentDate.getMonth();

        // 1. Cabecera (Mes y Año)
        this.monthYearEl.textContent = `${MONTH_NAMES[month]} ${year}`;

        // 2. Limpiar cuadrícula
        this.daysGridEl.innerHTML = '';

        // Obtener postulaciones para pintar fechas clave en el calendario
        const offers = this.getOffers();

        // Obtener primer día de la semana del mes y número de días del mes
        const dayOfWeek = new Date(year, month, 1).getDay(); // 0 = Domingo, 1 = Lunes...
        const totalDays = new Date(year, month + 1, 0).getDate();

        // Adaptar índice para que empiece en lunes (formato europeo)
        // Lunes = 0, Martes = 1, ..., Domingo = 6
        const emptyDaysCount = (dayOfWeek - 1 + 7) % 7;

        // Rellenar espacios vacíos del principio del mes
        for (let i = 0; i < emptyDaysCount; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            this.daysGridEl.appendChild(emptyDay);
        }

        const today = new Date();

        // Rellenar los días del mes
        for (let day = 1; day <= totalDays; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Elemento de texto con número de día
            const numEl = document.createElement('span');
            numEl.className = 'calendar-day-num';
            numEl.textContent = day;
            dayEl.appendChild(numEl);

            // Resaltar Hoy
            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayEl.classList.add('today');
            }

            // Comprobar si el día tiene eventos o hitos de ofertas
            const dayEvents = CalendarState.events.filter(e => e.fecha === dateStr);
            const dayPostulations = offers.filter(o => o.fecha_postulacion === dateStr);
            const dayInterviews = offers.filter(o => o.fecha_entrevista === dateStr);

            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'calendar-event-dots';

            // Dot para postulaciones (Azul)
            if (dayPostulations.length > 0) {
                const dot = document.createElement('div');
                dot.className = 'dot';
                dot.style.backgroundColor = 'var(--accent-indigo)';
                dot.title = `Postulación: ${dayPostulations.map(o => o.empresa).join(', ')}`;
                dotsContainer.appendChild(dot);
            }

            // Dot para eventos agendados (Cyan)
            if (dayEvents.length > 0) {
                dayEl.classList.add('has-event');
                dayEvents.forEach(ev => {
                    const dot = document.createElement('div');
                    dot.className = 'dot dot-event';
                    dot.title = `${ev.tipo}: ${ev.titulo}`;
                    dotsContainer.appendChild(dot);
                });
            }

            // Dot para entrevistas directas de la oferta (Amber)
            if (dayInterviews.length > 0) {
                dayEl.classList.add('has-interview');
                const dot = document.createElement('div');
                dot.className = 'dot dot-interview';
                dot.title = `Entrevista: ${dayInterviews.map(o => o.empresa).join(', ')}`;
                dotsContainer.appendChild(dot);
            }

            dayEl.appendChild(dotsContainer);

            // Evento click al día para ver/gestionar eventos de esa fecha
            dayEl.addEventListener('click', () => {
                this.showDayEvents(dateStr);
            });

            this.daysGridEl.appendChild(dayEl);
        }

        // 3. Renderizar listado de la agenda (Próximos Eventos)
        this.renderUpcomingEvents(year, month);
    }

    // Renderizar la lista de eventos en el sidebar derecho
    renderUpcomingEvents(year, month) {
        this.upcomingEventsEl.innerHTML = '';
        const offers = this.getOffers();

        // Filtrar eventos del mes actual en orden cronológico
        const currentMonthEvents = CalendarState.events.filter(ev => {
            const evDate = new Date(ev.fecha);
            return evDate.getFullYear() === year && evDate.getMonth() === month;
        });

        // Ordenar por fecha y hora
        currentMonthEvents.sort((a, b) => {
            const datetimeA = new Date(`${a.fecha}T${a.hora}`);
            const datetimeB = new Date(`${b.fecha}T${b.hora}`);
            return datetimeA - datetimeB;
        });

        if (currentMonthEvents.length === 0) {
            this.upcomingEventsEl.innerHTML = `
                <div class="text-center text-secondary py-4 fs-7">
                    <i class="bi bi-calendar-x d-block fs-4 mb-2 text-secondary opacity-50"></i>
                    No hay eventos para este mes.
                </div>
            `;
            return;
        }

        currentMonthEvents.forEach(ev => {
            const evItem = document.createElement('div');
            
            // Buscar empresa asociada
            const offer = offers.find(o => String(o.id) === String(ev.oferta_id));
            const empresaName = offer ? offer.empresa : 'Empresa General';

            // Determinar estilo de borde e insignias
            let eventClass = 'meeting';
            let badgeStyleClass = 'badge-event-meeting';
            if (ev.tipo === 'Entrevista') {
                eventClass = 'interview';
                badgeStyleClass = 'badge-event-interview';
            } else if (ev.tipo === 'Prueba Técnica') {
                eventClass = 'test';
                badgeStyleClass = 'badge-event-test';
            } else if (ev.tipo === 'Seguimiento') {
                eventClass = 'followup';
                badgeStyleClass = 'badge-event-followup';
            }

            const evDate = new Date(ev.fecha);
            const formattedDate = evDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

            evItem.className = `event-item ${eventClass}`;
            evItem.innerHTML = `
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="badge ${badgeStyleClass} fs-8 px-2">${ev.tipo}</span>
                    <span class="text-secondary fw-bold fs-8">${formattedDate} - ${ev.hora} hs</span>
                </div>
                <div class="fw-bold text-light mb-1">${ev.titulo}</div>
                <div class="text-gradient-indigo fw-semibold mb-1" style="font-size: 0.8rem;">
                    <i class="bi bi-building me-1"></i>${empresaName}
                </div>
                <div class="text-secondary fs-8 mt-1 border-top pt-1 border-secondary" style="border-color: rgba(255,255,255,0.05) !important;">
                    ${ev.descripcion || 'Sin descripción adicional.'}
                </div>
            `;

            this.upcomingEventsEl.appendChild(evItem);
        });
    }

    // Mostrar eventos e hitos de un día en el modal intermedio
    showDayEvents(dateStr) {
        this.selectedDateForNewEvent = dateStr;

        // Formatear la fecha en español legible (ej. Sábado, 23 de Mayo de 2026)
        const dateParts = dateStr.split('-');
        // Crear la fecha usando valores locales para evitar desfases de zona horaria
        const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let formattedDate = dateObj.toLocaleDateString('es-ES', options);
        // Capitalizar primer carácter
        formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

        if (this.dayEventsDateEl) {
            this.dayEventsDateEl.textContent = formattedDate;
        }

        // Obtener eventos y ofertas del día
        const dayEvents = CalendarState.events.filter(e => e.fecha === dateStr);
        const offers = this.getOffers();
        const dayPostulations = offers.filter(o => o.fecha_postulacion === dateStr);
        const dayInterviews = offers.filter(o => o.fecha_entrevista === dateStr);

        if (this.dayEventsListEl) {
            this.dayEventsListEl.innerHTML = '';

            const hasAnyEvents = dayEvents.length > 0 || dayPostulations.length > 0 || dayInterviews.length > 0;

            if (!hasAnyEvents) {
                this.dayEventsListEl.innerHTML = `
                    <div class="text-center text-secondary py-4 fs-7">
                        <i class="bi bi-calendar-x d-block fs-4 mb-2 text-secondary opacity-50"></i>
                        No hay eventos ni postulaciones para este día.
                    </div>
                `;
            } else {
                // 1. Mostrar Postulaciones registradas ese día
                dayPostulations.forEach(offer => {
                    const item = document.createElement('div');
                    item.className = 'event-item';
                    item.style.borderLeftColor = 'var(--accent-indigo)';
                    item.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle fs-8 px-2">POSTULACIÓN</span>
                            <span class="text-secondary fw-bold fs-8">Nueva Solicitud</span>
                        </div>
                        <div class="fw-bold text-light mb-1">Postulado a: ${offer.puesto}</div>
                        <div class="text-gradient-indigo fw-semibold" style="font-size: 0.8rem;">
                            <i class="bi bi-building me-1"></i>${offer.empresa}
                        </div>
                        ${offer.modalidad ? `
                        <div class="text-secondary fs-8 mt-1">
                            <i class="bi bi-geo-alt me-1"></i>Modalidad: ${offer.modalidad} ${offer.ubicacion_nombre ? `(${offer.ubicacion_nombre})` : ''}
                        </div>` : ''}
                    `;
                    this.dayEventsListEl.appendChild(item);
                });

                // 2. Mostrar Entrevistas directas registradas en la oferta para ese día
                dayInterviews.forEach(offer => {
                    // Solo si no hay ya un evento del calendario que asocie esta entrevista en esta fecha
                    const isAlreadyInEvents = dayEvents.some(e => String(e.oferta_id) === String(offer.id) && e.tipo === 'Entrevista');
                    if (!isAlreadyInEvents) {
                        const item = document.createElement('div');
                        item.className = 'event-item interview';
                        item.innerHTML = `
                            <div class="d-flex justify-content-between align-items-start mb-1">
                                <span class="badge badge-event-interview fs-8 px-2">Entrevista</span>
                                <span class="text-secondary fw-bold fs-8">Hito de Oferta</span>
                            </div>
                            <div class="fw-bold text-light mb-1">Entrevista programada para: ${offer.puesto}</div>
                            <div class="text-gradient-indigo fw-semibold" style="font-size: 0.8rem;">
                                <i class="bi bi-building me-1"></i>${offer.empresa}
                            </div>
                        `;
                        this.dayEventsListEl.appendChild(item);
                    }
                });

                // 3. Mostrar Eventos agendados del Calendario
                dayEvents.forEach(ev => {
                    const offer = offers.find(o => String(o.id) === String(ev.oferta_id));
                    const empresaName = offer ? offer.empresa : 'Empresa General';

                    let eventClass = 'meeting';
                    let badgeStyleClass = 'badge-event-meeting';
                    if (ev.tipo === 'Entrevista') {
                        eventClass = 'interview';
                        badgeStyleClass = 'badge-event-interview';
                    } else if (ev.tipo === 'Prueba Técnica') {
                        eventClass = 'test';
                        badgeStyleClass = 'badge-event-test';
                    } else if (ev.tipo === 'Seguimiento') {
                        eventClass = 'followup';
                        badgeStyleClass = 'badge-event-followup';
                    }

                    const item = document.createElement('div');
                    item.className = `event-item ${eventClass}`;
                    item.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <span class="badge ${badgeStyleClass} fs-8 px-2">${ev.tipo}</span>
                            <span class="text-secondary fw-bold fs-8">${ev.hora} hs</span>
                        </div>
                        <div class="fw-bold text-light mb-1">${ev.titulo}</div>
                        <div class="text-gradient-indigo fw-semibold mb-1" style="font-size: 0.8rem;">
                            <i class="bi bi-building me-1"></i>${empresaName}
                        </div>
                        ${ev.descripcion ? `
                        <div class="text-secondary fs-8 mt-1 border-top pt-1 border-secondary" style="border-color: rgba(255,255,255,0.05) !important;">
                            ${ev.descripcion}
                        </div>
                        ` : ''}
                    `;
                    this.dayEventsListEl.appendChild(item);
                });
            }
        }

        if (this.dayEventsModal) {
            this.dayEventsModal.show();
        }
    }
}
