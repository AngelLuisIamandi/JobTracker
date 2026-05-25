/* ==========================================================================
   JS Sitios de Búsqueda Frecuente (Fase 6) - JobTracker
   ========================================================================== */

const API_BASE_PORTALS = window.API_BASE_URL || 'servidor';
const MOCK_CATEGORIES_KEY = 'job_tracker_search_categories';
const MOCK_PORTALS_KEY = 'job_tracker_search_portals';

let categories = [];
let portals = [];
let isMockMode = false;

// Inyectar estilos CSS específicos para Drag & Drop y transiciones de manera dinámica
const injectStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        .drag-zone {
            min-height: 80px;
            transition: all 0.2s ease;
            border-radius: 8px;
            padding: 5px;
        }
        .drag-zone.drag-hover {
            background: rgba(90, 98, 246, 0.08) !important;
            border: 2px dashed rgba(90, 98, 246, 0.4) !important;
        }
        .portal-card {
            cursor: grab;
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.3s ease, border-color 0.3s ease;
            padding: 12px 16px !important;
        }
        .portal-card:active {
            cursor: grabbing;
        }
        .portal-card.dragging {
            opacity: 0.4;
            transform: scale(0.95);
        }
        .category-column {
            transition: all 0.3s ease;
        }
        .bg-green-decay {
            background: rgba(16, 185, 129, 0.08);
            border-color: rgba(16, 185, 129, 0.2) !important;
        }
    `;
    document.head.appendChild(styleEl);
};

document.addEventListener('DOMContentLoaded', () => {
    // Rellenar navbar
    const session = Auth.isAuthenticated();
    if (session && session.user) {
        document.getElementById('navbar-username').textContent = session.user.nombre;
    }

    // Botón de salir
    document.getElementById('btn-logout').addEventListener('click', () => {
        Auth.logout();
    });

    injectStyles();
    loadCategoriesAndPortals();

    // Event listeners para los formularios de modales
    document.getElementById('form-category').addEventListener('submit', handleCategorySubmit);
    document.getElementById('form-portal').addEventListener('submit', handlePortalSubmit);

    // Eventos al abrir modales para limpiar formularios
    document.getElementById('modal-category').addEventListener('show.bs.modal', (e) => {
        const trigger = e.relatedTarget;
        // Si no fue abierto por el botón "Editar", limpiar form
        if (!trigger || !trigger.classList.contains('btn-edit-category-trigger')) {
            document.getElementById('modalCategoryTitle').textContent = 'Nueva Categoría';
            document.getElementById('category-edit-id').value = '';
            document.getElementById('input-category-name').value = '';
        }
    });

    document.getElementById('modal-portal').addEventListener('show.bs.modal', (e) => {
        const trigger = e.relatedTarget;
        populateCategoryDropdown();
        if (!trigger || !trigger.classList.contains('btn-edit-portal-trigger')) {
            document.getElementById('modalPortalTitle').textContent = 'Nuevo Sitio de Búsqueda';
            document.getElementById('portal-edit-id').value = '';
            document.getElementById('input-portal-name').value = '';
            document.getElementById('input-portal-url').value = '';
            document.getElementById('select-portal-category').value = '';
        }
    });
});

// Cargar categorías y portales (desde API o Mock Fallback)
async function loadCategoriesAndPortals() {
    const session = Auth.isAuthenticated();
    const token = session ? session.token : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_PORTALS}/portals.php`, { headers });
        if (response.ok) {
            const data = await response.json();
            categories = data.categories || [];
            portals = data.portals || [];
            isMockMode = false;
        } else {
            throw new Error('Respuesta de API incorrecta');
        }
    } catch (error) {
        console.warn('Fallo en API de portales. Usando almacenamiento localStorage mock.');
        isMockMode = true;
        loadMockData();
    }

    renderDashboard();
}

// Cargar datos locales de LocalStorage con Semilla de Prueba
function loadMockData() {
    let savedCategories = localStorage.getItem(MOCK_CATEGORIES_KEY);
    let savedPortals = localStorage.getItem(MOCK_PORTALS_KEY);

    if (!savedCategories || !savedPortals) {
        // Sembrar datos por defecto
        const defaultCategories = [
            { id: 101, name: 'Portales de Empleo' },
            { id: 102, name: 'Redes Profesionales' },
            { id: 103, name: 'Canales y Foros' }
        ];

        // Fechas de ejemplo para ver el difuminado verde
        const now = Date.now();
        const defaultPortals = [
            { id: 201, category_id: 102, name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/', last_opened: new Date(now).toISOString() },
            { id: 202, category_id: 101, name: 'InfoJobs', url: 'https://www.infojobs.net/', last_opened: new Date(now - 12 * 3600000).toISOString() }, // 12h de antigüedad (verde medio)
            { id: 203, category_id: 101, name: 'Indeed', url: 'https://www.indeed.com/', last_opened: new Date(now - 25 * 3600000).toISOString() }, // 25h de antigüedad (sin verde)
            { id: 204, category_id: 103, name: 'GitHub Jobs Fallback', url: 'https://github.com/', last_opened: null },
            { id: 205, category_id: null, name: 'Google Jobs Search', url: 'https://google.com/', last_opened: null }
        ];

        localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(defaultCategories));
        localStorage.setItem(MOCK_PORTALS_KEY, JSON.stringify(defaultPortals));

        categories = defaultCategories;
        portals = defaultPortals;
    } else {
        categories = JSON.parse(savedCategories);
        portals = JSON.parse(savedPortals);
    }
}

// Guardar datos mock en LocalStorage
function saveMockData() {
    localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(categories));
    localStorage.setItem(MOCK_PORTALS_KEY, JSON.stringify(portals));
}

// Rellenar selector de categorías en modal de portales
function populateCategoryDropdown() {
    const select = document.getElementById('select-portal-category');
    select.innerHTML = '<option value="">Sin Categoría</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
}

// Renderizar el Dashboard principal
function renderDashboard() {
    const grid = document.getElementById('categories-grid');
    grid.innerHTML = '';

    // Agrupar portales por categoría
    const portalsByCategory = {};
    categories.forEach(cat => {
        portalsByCategory[cat.id] = [];
    });
    portalsByCategory['uncategorized'] = [];

    portals.forEach(portal => {
        if (portal.category_id && portalsByCategory[portal.category_id]) {
            portalsByCategory[portal.category_id].push(portal);
        } else {
            portalsByCategory['uncategorized'].push(portal);
        }
    });

    // 1. Renderizar categorías normales
    categories.forEach(cat => {
        const catCol = createCategoryColumnHTML(cat, portalsByCategory[cat.id]);
        grid.appendChild(catCol);
    });

    // 2. Renderizar la columna "Sin Categoría" si tiene portales
    if (portalsByCategory['uncategorized'].length > 0) {
        const uncategorizedCol = createCategoryColumnHTML(
            { id: 'uncategorized', name: 'Sin Categoría', isUncategorized: true }, 
            portalsByCategory['uncategorized']
        );
        grid.appendChild(uncategorizedCol);
    }

    // Configurar listeners de Arrastrar y Soltar (Drag & Drop)
    setupDragAndDrop();
}

// Crear elemento HTML para una categoría
function createCategoryColumnHTML(category, categoryPortals) {
    const col = document.createElement('div');
    col.className = 'col category-column animate-fade-in';
    col.dataset.categoryId = category.id;

    // Configurar dropdown de acciones si no es la columna de "Sin Categoría"
    const dropdownHtml = !category.isUncategorized ? `
        <div class="dropdown">
            <button class="btn btn-link text-secondary p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="dropdownMenu-${category.id}">
                <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark" aria-labelledby="dropdownMenu-${category.id}">
                <li>
                    <button class="dropdown-item btn-edit-category-trigger" type="button" onclick="openEditCategory(${category.id}, '${category.name}')">
                        <i class="bi bi-pencil me-2"></i>Editar Nombre
                    </button>
                </li>
                <li>
                    <hr class="dropdown-divider" style="border-color: rgba(255,255,255,0.08);">
                </li>
                <li>
                    <button class="dropdown-item text-danger" type="button" onclick="deleteCategory(${category.id})">
                        <i class="bi bi-trash me-2"></i>Eliminar Categoría
                    </button>
                </li>
            </ul>
        </div>
    ` : '';

    col.innerHTML = `
        <div class="glass-container p-3 h-100 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="fs-6 fw-bold text-light mb-0 d-flex align-items-center">
                    <i class="bi ${category.isUncategorized ? 'bi-folder2' : 'bi-folder-fill'} text-gradient-indigo me-2"></i>
                    ${category.name}
                    <span class="badge bg-secondary ms-2 fs-9" style="background: rgba(255,255,255,0.08) !important;">${categoryPortals.length}</span>
                </h3>
                ${dropdownHtml}
            </div>
            
            <!-- Zona de Soltar (Drop Zone) -->
            <div class="drag-zone flex-grow-1 d-flex flex-column gap-2" id="drag-zone-${category.id}" data-category-id="${category.isUncategorized ? '' : category.id}">
                ${categoryPortals.length === 0 ? `
                    <div class="text-center text-secondary py-4 fs-8 border border-dashed border-secondary rounded-3 d-flex flex-column align-items-center justify-content-center" style="border-color: rgba(255,255,255,0.08) !important; min-height: 90px;">
                        <i class="bi bi-arrow-down-short fs-5 mb-1 opacity-50"></i>
                        Arrastra sitios aquí
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // Renderizar tarjetas de portales dentro de la zona de arrastre
    const dragZone = col.querySelector(`.drag-zone`);
    categoryPortals.forEach(portal => {
        const portalCard = createPortalCardHTML(portal);
        dragZone.appendChild(portalCard);
    });

    return col;
}

// Crear elemento HTML para un portal
function createPortalCardHTML(portal) {
    const card = document.createElement('div');
    card.className = 'glass-container p-3 portal-card';
    card.id = `portal-${portal.id}`;
    card.setAttribute('draggable', 'true');
    card.dataset.portalId = portal.id;

    // Calcular indicador verde de degradación por 24h
    let statusBadge = '';
    let styleOverride = '';

    if (portal.last_opened) {
        const lastOpenedTime = new Date(portal.last_opened).getTime();
        const diffMs = Date.now() - lastOpenedTime;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 24) {
            const alpha = 1 - (diffHours / 24);
            // Aplicar fondo verde translúcido y borde verde según la antigüedad
            styleOverride = `
                background: rgba(16, 185, 129, ${alpha * 0.12}) !important;
                border-color: rgba(16, 185, 129, ${alpha * 0.35}) !important;
            `;

            // Calcular etiqueta de tiempo amigable
            let timeText = '';
            if (diffHours < 1) {
                const mins = Math.max(1, Math.round(diffMs / 60000));
                timeText = `${mins}m`;
            } else {
                timeText = `${Math.round(diffHours)}h`;
            }
            statusBadge = `<span class="badge bg-emerald fs-9" style="background: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; border: 1px solid rgba(16, 185, 129, 0.25) !important;">Abierto hace ${timeText}</span>`;
        } else {
            statusBadge = `<span class="badge bg-secondary fs-9" style="background: rgba(245, 158, 11, 0.1) !important; color: #fbbf24 !important; border: 1px solid rgba(245, 158, 11, 0.2) !important;">Revisar hoy</span>`;
        }
    } else {
        statusBadge = `<span class="badge bg-secondary fs-9" style="background: rgba(255,255,255,0.05) !important; color: var(--text-secondary) !important; border: 1px solid rgba(255,255,255,0.08) !important;">No visitado</span>`;
    }

    if (styleOverride !== '') {
        card.setAttribute('style', styleOverride);
    }

    // Limitar longitud del URL para no romper diseño
    const displayUrl = portal.url.replace(/https?:\/\/(www\.)?/, '').substring(0, 30) + (portal.url.length > 30 ? '...' : '');

    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div style="max-width: 75%;">
                <a href="${portal.url}" target="_blank" rel="noopener" class="text-light fw-semibold fs-7 text-decoration-none portal-link d-flex align-items-center gap-1.5" id="portal-link-${portal.id}">
                    ${portal.name} <i class="bi bi-box-arrow-up-right fs-9 text-secondary"></i>
                </a>
                <div class="text-secondary fs-9 text-truncate mt-0.5" title="${portal.url}">${displayUrl}</div>
            </div>
            <div class="d-flex align-items-center gap-2">
                ${statusBadge}
                
                <div class="dropdown">
                    <button class="btn btn-link text-secondary p-1" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="portalMenu-${portal.id}">
                        <i class="bi bi-three-dots"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark fs-8" aria-labelledby="portalMenu-${portal.id}">
                        <li>
                            <button class="dropdown-item btn-edit-portal-trigger" type="button" onclick="openEditPortal(${portal.id})">
                                <i class="bi bi-pencil me-1.5"></i>Editar
                            </button>
                        </li>
                        <li>
                            <button class="dropdown-item text-danger" type="button" onclick="deletePortal(${portal.id})">
                                <i class="bi bi-trash me-1.5"></i>Eliminar
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    `;

    // Escuchar el clic en el enlace para actualizar last_opened
    const linkEl = card.querySelector(`.portal-link`);
    linkEl.addEventListener('click', () => {
        handlePortalClick(portal.id);
    });

    return card;
}

// Registrar clic en un portal (resetear verde 24h)
async function handlePortalClick(portalId) {
    const portal = portals.find(p => p.id == portalId);
    if (!portal) return;

    const nowStr = new Date().toISOString();
    portal.last_opened = nowStr;

    // Actualizar visualmente la tarjeta de inmediato
    const cardEl = document.getElementById(`portal-${portalId}`);
    if (cardEl) {
        // Reemplazar el badge por "Cargando..."
        const badge = cardEl.querySelector('.badge');
        if (badge) {
            badge.className = "badge bg-emerald fs-9";
            badge.textContent = "Abierto hace 1m";
            badge.style.background = "rgba(16, 185, 129, 0.15) !important";
            badge.style.color = "#34d399 !important";
        }
        cardEl.style.background = "rgba(16, 185, 129, 0.12) !important";
        cardEl.style.borderColor = "rgba(16, 185, 129, 0.35) !important";
    }

    if (isMockMode) {
        saveMockData();
    } else {
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            await fetch(`${API_BASE_PORTALS}/portals.php?resource=portal&id=${portalId}`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify({ register_click: true })
            });
        } catch (err) {
            console.error('Error al registrar click en servidor:', err);
        }
    }

    // Volver a renderizar después de un pequeño delay para reflejar la hora exacta
    setTimeout(renderDashboard, 1000);
}

// Configurar controladores de eventos Drag & Drop nativos
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.portal-card');
    const zones = document.querySelectorAll('.drag-zone');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.portalId);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    });

    zones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault(); // Permitir soltar
        });

        zone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            zone.classList.add('drag-hover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-hover');
        });

        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag-hover');

            const portalId = parseInt(e.dataTransfer.getData('text/plain'));
            const targetCategoryId = zone.dataset.categoryId ? parseInt(zone.dataset.categoryId) : null;

            if (isNaN(portalId)) return;

            // Encontrar y actualizar portal localmente
            const portal = portals.find(p => p.id === portalId);
            if (portal && portal.category_id !== targetCategoryId) {
                const oldCategory = portal.category_id;
                portal.category_id = targetCategoryId;

                // Actualizar UI de forma inmediata
                renderDashboard();

                if (isMockMode) {
                    saveMockData();
                    showToast('Sitio reubicado exitosamente.', 'success');
                } else {
                    try {
                        const session = Auth.isAuthenticated();
                        const token = session ? session.token : '';
                        const headers = { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        };

                        const response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=portal&id=${portalId}`, {
                            method: 'PUT',
                            headers: headers,
                            body: JSON.stringify({ category_id: targetCategoryId })
                        });

                        if (response.ok) {
                            showToast('Ubicación de sitio guardada en servidor.', 'success');
                        } else {
                            throw new Error('Error al actualizar en servidor');
                        }
                    } catch (err) {
                        console.error('Error al mover portal:', err);
                        // Revertir en caso de fallo
                        portal.category_id = oldCategory;
                        renderDashboard();
                        showToast('Error al reubicar en servidor. Revertido.', 'error');
                    }
                }
            }
        });
    });
}

// CRUD Categorías - Submit Form (Crear/Editar)
async function handleCategorySubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('category-edit-id').value;
    const name = document.getElementById('input-category-name').value.trim();

    if (!name) return;

    const modalEl = document.getElementById('modal-category');
    const modal = bootstrap.Modal.getInstance(modalEl);

    if (isMockMode) {
        if (editId) {
            // Editar
            const cat = categories.find(c => c.id == editId);
            if (cat) cat.name = name;
            showToast('Categoría modificada.', 'success');
        } else {
            // Crear
            const newCat = {
                id: Date.now(),
                name: name
            };
            categories.push(newCat);
            showToast('Categoría creada.', 'success');
        }
        saveMockData();
        renderDashboard();
        modal.hide();
    } else {
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            let response;
            if (editId) {
                // PUT
                response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=category&id=${editId}`, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify({ name })
                });
            } else {
                // POST
                response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=category`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ name })
                });
            }

            if (response.ok) {
                showToast(editId ? 'Categoría modificada.' : 'Categoría creada con éxito.', 'success');
                loadCategoriesAndPortals();
                modal.hide();
            } else {
                const err = await response.json();
                showToast(err.error || 'Error al guardar la categoría.', 'error');
            }
        } catch (err) {
            console.error('Error al guardar categoría:', err);
            showToast('Fallo al conectar con el servidor.', 'error');
        }
    }
}

// Abrir Modal de Categoría en Modo Edición
function openEditCategory(id, name) {
    document.getElementById('modalCategoryTitle').textContent = 'Editar Categoría';
    document.getElementById('category-edit-id').value = id;
    document.getElementById('input-category-name').value = name;
    
    const modalEl = document.getElementById('modal-category');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

// Eliminar Categoría
async function deleteCategory(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta categoría? Los sitios que contiene se moverán a "Sin Categoría".')) return;

    if (isMockMode) {
        // Eliminar y reasignar portales
        categories = categories.filter(c => c.id != id);
        portals.forEach(p => {
            if (p.category_id == id) p.category_id = null;
        });
        saveMockData();
        renderDashboard();
        showToast('Categoría eliminada.', 'success');
    } else {
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            const response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=category&id=${id}`, {
                method: 'DELETE',
                headers: headers
            });

            if (response.ok) {
                showToast('Categoría eliminada.', 'success');
                loadCategoriesAndPortals();
            } else {
                const err = await response.json();
                showToast(err.error || 'Error al eliminar la categoría.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Fallo de conexión.', 'error');
        }
    }
}

// CRUD Portales - Submit Form (Crear/Editar)
async function handlePortalSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('portal-edit-id').value;
    const name = document.getElementById('input-portal-name').value.trim();
    const url = document.getElementById('input-portal-url').value.trim();
    const categoryVal = document.getElementById('select-portal-category').value;
    const category_id = categoryVal ? parseInt(categoryVal) : null;

    if (!name || !url) return;

    const modalEl = document.getElementById('modal-portal');
    const modal = bootstrap.Modal.getInstance(modalEl);

    if (isMockMode) {
        if (editId) {
            const portal = portals.find(p => p.id == editId);
            if (portal) {
                portal.name = name;
                portal.url = url;
                portal.category_id = category_id;
            }
            showToast('Sitio web modificado.', 'success');
        } else {
            const newPortal = {
                id: Date.now(),
                category_id: category_id,
                name: name,
                url: url,
                last_opened: null
            };
            portals.push(newPortal);
            showToast('Sitio web registrado.', 'success');
        }
        saveMockData();
        renderDashboard();
        modal.hide();
    } else {
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            let response;
            if (editId) {
                // PUT
                response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=portal&id=${editId}`, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify({ name, url, category_id })
                });
            } else {
                // POST
                response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=portal`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ name, url, category_id })
                });
            }

            if (response.ok) {
                showToast(editId ? 'Sitio web modificado.' : 'Sitio web registrado.', 'success');
                loadCategoriesAndPortals();
                modal.hide();
            } else {
                const err = await response.json();
                showToast(err.error || 'Error al guardar el sitio web.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Fallo al conectar con el servidor.', 'error');
        }
    }
}

// Abrir Modal de Portal en Modo Edición
function openEditPortal(id) {
    const portal = portals.find(p => p.id == id);
    if (!portal) return;

    populateCategoryDropdown();

    document.getElementById('modalPortalTitle').textContent = 'Editar Sitio de Búsqueda';
    document.getElementById('portal-edit-id').value = id;
    document.getElementById('input-portal-name').value = portal.name;
    document.getElementById('input-portal-url').value = portal.url;
    document.getElementById('select-portal-category').value = portal.category_id || '';

    const modalEl = document.getElementById('modal-portal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

// Eliminar Portal
async function deletePortal(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este sitio web de búsqueda?')) return;

    if (isMockMode) {
        portals = portals.filter(p => p.id != id);
        saveMockData();
        renderDashboard();
        showToast('Sitio web eliminado.', 'success');
    } else {
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            const response = await fetch(`${API_BASE_PORTALS}/portals.php?resource=portal&id=${id}`, {
                method: 'DELETE',
                headers: headers
            });

            if (response.ok) {
                showToast('Sitio web eliminado.', 'success');
                loadCategoriesAndPortals();
            } else {
                const err = await response.json();
                showToast(err.error || 'Error al eliminar el sitio web.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Fallo de conexión.', 'error');
        }
    }
}
