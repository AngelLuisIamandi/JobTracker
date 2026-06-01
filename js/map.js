/* ==========================================================================
   JS Mapa Interactivo & Geolocalización - JobTracker
   ========================================================================== */

let userLocation = null; // { lat, lon }
let map = null;
let userMarker = null;
let jobMarkers = {}; // map job.id -> marker
let activeRouteLayer = null; // Leaflet polyline for OSRM route
let currentActiveCard = null;
let currentRouteJobId = null;
let allOffers = []; // cache of loaded offers
let clickedJobId = null; // pinned job id
let markerWithTooltip = null; // tracking active route tooltip

const MOCK_OFFERS_KEY = 'job_tracker_offers';

function getStorageKey(baseKey) {
    const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
    if (session && session.user && session.user.email) {
        return `${baseKey}_user_${session.user.email}`;
    }
    return baseKey;
}

const API_BASE_MAP = window.API_BASE_URL || 'servidor';
const API_OFFERS_URLS = {
    list: `${API_BASE_MAP}/applications.php`
};

document.addEventListener('DOMContentLoaded', () => {
    // Rellenar navbar con nombre
    const session = Auth.isAuthenticated();
    if (session && session.user) {
        document.getElementById('navbar-username').textContent = session.user.nombre;
    }

    // Botón de salir
    document.getElementById('btn-logout').addEventListener('click', () => {
        Auth.logout();
    });

    // Cargar configuraciones de combustible desde localStorage si existen
    const savedPrice = localStorage.getItem('job_tracker_fuel_price');
    const savedConsumption = localStorage.getItem('job_tracker_fuel_consumption');
    const fuelPriceInput = document.getElementById('input-fuel-price');
    const fuelConsInput = document.getElementById('input-fuel-consumption');

    if (savedPrice && fuelPriceInput) fuelPriceInput.value = savedPrice;
    if (savedConsumption && fuelConsInput) fuelConsInput.value = savedConsumption;

    // Escuchadores de configuraciones de combustible
    if (fuelPriceInput) {
        fuelPriceInput.addEventListener('input', () => {
            localStorage.setItem('job_tracker_fuel_price', fuelPriceInput.value);
            updateJobDistances();
            recalculateActiveRoute();
        });
    }
    if (fuelConsInput) {
        fuelConsInput.addEventListener('input', () => {
            localStorage.setItem('job_tracker_fuel_consumption', fuelConsInput.value);
            updateJobDistances();
            recalculateActiveRoute();
        });
    }

    // Escuchadores de preferencias de ruta (Fase 2+)
    const avoidTollsCheck = document.getElementById('switch-avoid-tolls');
    const avoidHighwaysCheck = document.getElementById('switch-avoid-highways');
    if (avoidTollsCheck) {
        avoidTollsCheck.addEventListener('change', () => {
            updateJobDistances();
            recalculateActiveRoute();
        });
    }
    if (avoidHighwaysCheck) {
        avoidHighwaysCheck.addEventListener('change', () => {
            updateJobDistances();
            recalculateActiveRoute();
        });
    }

    // Cargar perfil del usuario o iniciar geolocalización
    loadUserProfile();

    // Listener para cambiar ubicación de inicio
    const btnChangeStart = document.getElementById('btn-change-start-location');
    if (btnChangeStart) {
        btnChangeStart.addEventListener('click', () => {
            showFallbackLocationModal(true); // Habilitar modo cancelable
        });
    }

    // --- Registro de Filtros de Ofertas ---
    const searchInput = document.getElementById('input-filter-search');
    const dateFromInput = document.getElementById('input-filter-date-from');
    const dateToInput = document.getElementById('input-filter-date-to');
    const statusSelect = document.getElementById('select-filter-status');
    const modalitySelect = document.getElementById('select-filter-modality');
    const distanceSlider = document.getElementById('range-filter-distance');
    const distanceValText = document.getElementById('range-filter-distance-val');
    const btnReset = document.getElementById('btn-reset-filters');

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (dateFromInput) dateFromInput.addEventListener('change', applyFilters);
    if (dateToInput) dateToInput.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    if (modalitySelect) modalitySelect.addEventListener('change', applyFilters);
    
    if (distanceSlider && distanceValText) {
        distanceSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (val >= 101) {
                distanceValText.textContent = 'Sin límite';
            } else {
                distanceValText.textContent = `${val} km`;
            }
            applyFilters();
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (dateFromInput) dateFromInput.value = '';
            if (dateToInput) dateToInput.value = '';
            if (statusSelect) statusSelect.value = 'Todos';
            if (modalitySelect) modalitySelect.value = 'Todos';
            if (distanceSlider) distanceSlider.value = 101;
            if (distanceValText) distanceValText.textContent = 'Sin límite';
            applyFilters();
        });
    }
});

let userAddress = '';
let isFallbackModalListenerAdded = false;

// Cargar ubicación guardada en el perfil del usuario o localStorage
async function loadUserProfile() {
    try {
        const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_MAP}/user_profile.php`, { headers });
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        if (response.ok) {
            const user = await response.json();
            if (user.home_latitude !== null && user.home_longitude !== null) {
                userLocation = {
                    lat: parseFloat(user.home_latitude),
                    lon: parseFloat(user.home_longitude)
                };
                userAddress = user.home_address || 'Ubicación guardada';
                
                // Actualizar texto en sidebar
                const startLocText = document.getElementById('start-location-text');
                if (startLocText) {
                    startLocText.textContent = userAddress;
                    startLocText.title = userAddress;
                }
                
                initMapAndDraw();
                return;
            }
        }
    } catch (err) {
        console.warn('Error al cargar perfil de usuario del servidor. Usando fallback local:', err);
    }
    
    // Fallback: verificar en localStorage
    const localHome = localStorage.getItem(getStorageKey('job_tracker_user_home'));
    if (localHome) {
        try {
            const saved = JSON.parse(localHome);
            userLocation = { lat: saved.lat, lon: saved.lon };
            userAddress = saved.address;
            
            const startLocText = document.getElementById('start-location-text');
            if (startLocText) {
                startLocText.textContent = userAddress;
                startLocText.title = userAddress;
            }
            initMapAndDraw();
            return;
        } catch (e) {
            console.warn('Error al leer home de localStorage:', e);
        }
    }

    // Si no hay ubicación guardada, solicitar geolocalización
    requestUserLocation();
}

// Pedir ubicación al navegador (GPS)
function requestUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                userLocation = { lat, lon };
                
                // Intentar hacer reverse geocoding para obtener dirección legible
                userAddress = `Ubicación GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
                try {
                    const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
                    const res = await fetch(reverseUrl, {
                        headers: {
                            'Accept-Language': 'es',
                            'User-Agent': 'JobTrackerApp/1.0'
                        }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        userAddress = data.display_name || userAddress;
                    }
                } catch (err) {
                    console.warn('Error en reverse geocoding:', err);
                }

                // Actualizar texto en el sidebar
                const startLocText = document.getElementById('start-location-text');
                if (startLocText) {
                    startLocText.textContent = userAddress;
                    startLocText.title = userAddress;
                }

                // Guardar en el perfil del usuario
                saveUserProfile(userAddress, lat, lon);

                initMapAndDraw();
            },
            (error) => {
                console.warn("Geolocalización rechazada o fallida. Mostrando modal de dirección fallback.");
                showFallbackLocationModal(false); // No cancelable al inicio si no hay ubicación
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.warn("Navegador no soporta geolocalización.");
        showFallbackLocationModal(false);
    }
}

// Modal premium de dirección de inicio alternativa
function showFallbackLocationModal(dismissible = false) {
    const modalEl = document.getElementById('modal-fallback-location');
    const btnCancel = document.getElementById('btn-cancel-fallback-location');
    
    if (dismissible) {
        modalEl.removeAttribute('data-bs-backdrop');
        modalEl.removeAttribute('data-bs-keyboard');
        if (btnCancel) btnCancel.classList.remove('d-none');
    } else {
        modalEl.setAttribute('data-bs-backdrop', 'static');
        modalEl.setAttribute('data-bs-keyboard', 'false');
        if (btnCancel) btnCancel.classList.add('d-none');
    }

    const fallbackModal = new bootstrap.Modal(modalEl);
    
    // Pre-rellenar dirección actual si existe
    const inputAddress = document.getElementById('input-fallback-address');
    if (inputAddress && userAddress && !userAddress.startsWith('Ubicación GPS')) {
        inputAddress.value = userAddress;
    }

    fallbackModal.show();

    // Evitar duplicar listeners de submit
    const form = document.getElementById('form-fallback-location');
    if (!isFallbackModalListenerAdded) {
        isFallbackModalListenerAdded = true;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const address = document.getElementById('input-fallback-address').value.trim();
            if (!address) return;

            const btn = document.getElementById('btn-save-fallback-location');
            const originalBtnText = btn.textContent;
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Buscando dirección...`;

            try {
                const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
                const geoRes = await fetch(geocodeUrl, {
                    headers: {
                        'Accept-Language': 'es',
                        'User-Agent': 'JobTrackerApp/1.0'
                    }
                });
                if (geoRes.ok) {
                    const geoData = await geoRes.json();
                    if (geoData && geoData.length > 0) {
                        const lat = parseFloat(geoData[0].lat);
                        const lon = parseFloat(geoData[0].lon);
                        userLocation = { lat, lon };
                        userAddress = address;

                        // Actualizar texto en el sidebar
                        const startLocText = document.getElementById('start-location-text');
                        if (startLocText) {
                            startLocText.textContent = userAddress;
                            startLocText.title = userAddress;
                        }

                        // Guardar perfil en servidor/local
                        await saveUserProfile(userAddress, lat, lon);

                        // Ocultar modal usando la instancia actual o buscando
                        const activeModal = bootstrap.Modal.getInstance(modalEl);
                        if (activeModal) activeModal.hide();

                        // Si el mapa ya estaba dibujado, actualizar el pin del usuario y recalcular rutas
                        if (map) {
                            if (userMarker) {
                                userMarker.setLatLng([lat, lon]);
                            }
                            map.setView([lat, lon], 13);
                            updateJobDistances();
                            recalculateActiveRoute();
                        } else {
                            initMapAndDraw();
                        }
                    } else {
                        showToast('No pudimos localizar la dirección introducida. Intenta ser más específico (ej: "Gran Vía, Madrid").', 'error');
                    }
                } else {
                    showToast('Error de conexión con el geocodificador Nominatim.', 'error');
                }
            } catch (err) {
                console.error('Error geolocalización fallback:', err);
                showToast('Ocurrió un error al buscar la dirección.', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = originalBtnText;
            }
        });
    }
}

// Guardar ubicación en el perfil y localStorage
async function saveUserProfile(address, lat, lon) {
    // Guardar localmente
    localStorage.setItem(getStorageKey('job_tracker_user_home'), JSON.stringify({ address, lat, lon }));

    try {
        const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_MAP}/user_profile.php`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                home_address: address,
                home_latitude: lat,
                home_longitude: lon
            })
        });
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        if (response.ok) {
            showToast('Ubicación de partida guardada en tu cuenta.', 'success');
        }
    } catch (err) {
        console.warn('No se pudo guardar la ubicación en la base de datos externa:', err);
    }
}

// Inicializar el mapa y pintar el punto de partida
function initMapAndDraw() {
    if (map) return;

    // Inicializar el mapa centrado en el usuario
    map = L.map('job-map').setView([userLocation.lat, userLocation.lon], 13);

    // Cargar mapa con tema Premium Dark (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Marcador de usuario de tipo pulsante
    const userIcon = L.divIcon({
        className: 'user-location-marker-container',
        html: '<div class="pulse-user-location" title="Tu posición"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    userMarker = L.marker([userLocation.lat, userLocation.lon], { icon: userIcon })
        .addTo(map)
        .bindPopup(`
            <div style="min-width: 140px;">
                <strong style="color: var(--accent-indigo);">Tu Punto de Partida</strong>
                <p class="text-secondary fs-8 mb-0 mt-1">Ubicación utilizada para calcular rutas.</p>
            </div>
        `);

    // Cargar ofertas
    loadJobsOnMap();
}

// Cargar ofertas desde API o Local Fallback
async function loadJobsOnMap() {
    let offers = [];
    try {
        const session = typeof Auth !== 'undefined' ? Auth.isAuthenticated() : null;
        const token = session ? session.token : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_OFFERS_URLS.list, { headers });
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        if (response.ok) {
            const data = await response.json() || [];
            // Mapear los datos de la base de datos (Inglés) a lo que espera el frontend (Español)
            offers = data.map(o => ({
                id: o.id,
                empresa: o.company,
                puesto: o.title,
                fecha_postulacion: o.date_applied,
                estado: o.status,
                salario: o.salario || null,
                interes: o.interes ? parseInt(o.interes) : 1,
                enlace: o.url || '',
                notas: o.description || '',
                modalidad: o.modalidad || 'Presencial',
                ubicacion: o.ubicacion_nombre || '',
                lat: o.latitud ? parseFloat(o.latitud) : null,
                lon: o.longitud ? parseFloat(o.longitud) : null
            }));
        } else {
            throw new Error('Servidor no disponible');
        }
    } catch (error) {
        console.warn('Cargando base de datos local para el mapa (Fallback).');
        const localData = localStorage.getItem(getStorageKey(MOCK_OFFERS_KEY));
        if (localData) {
            offers = JSON.parse(localData).map(o => ({
                ...o,
                interes: o.interes ? parseInt(o.interes) : 1
            }));
        } else {
            offers = [];
        }
    }

    renderJobs(offers, true);
}

// Crear pin SVG dinámico con color
function createCustomPin(color) {
    const svgPin = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="42">
            <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `;
    return L.divIcon({
        className: 'custom-job-pin',
        html: svgPin,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -40]
    });
}

// Renderizar ofertas en mapa y barra lateral
function renderJobs(offers, isInitialLoad = false) {
    if (isInitialLoad) {
        allOffers = offers;
    }

    // Limpiar marcadores anteriores del mapa
    Object.values(jobMarkers).forEach(marker => {
        if (map && marker) {
            map.removeLayer(marker);
        }
    });
    jobMarkers = {};

    // Limpiar la ruta activa si existe
    if (activeRouteLayer) {
        map.removeLayer(activeRouteLayer);
        activeRouteLayer = null;
    }
    currentRouteJobId = null;

    // Si el empleo clicado ya no está en el conjunto filtrado, desmarcarlo
    if (clickedJobId && !offers.some(j => j.id == clickedJobId)) {
        clickedJobId = null;
    }

    const mappedJobsList = document.getElementById('mapped-jobs-list');
    const remoteJobsList = document.getElementById('remote-jobs-list');

    mappedJobsList.innerHTML = '';
    remoteJobsList.innerHTML = '';

    if (offers.length === 0) {
        mappedJobsList.innerHTML = '<div class="text-center text-secondary py-3 fs-7">No se encontraron ofertas.</div>';
        remoteJobsList.innerHTML = '<div class="text-center text-secondary py-3 fs-7">No se encontraron ofertas en remoto.</div>';
        return;
    }

    const orangeIcon = createCustomPin('#f59e0b'); // Presencial
    const purpleIcon = createCustomPin('#9333ea'); // Híbrido

    let bounds = L.latLngBounds();
    bounds.extend([userLocation.lat, userLocation.lon]);

    let hasMappedJobs = false;
    let hasRemoteJobs = false;

    offers.forEach(job => {
        const isRemote = job.modalidad === 'Remoto';
        const hasCoordinates = job.lat !== null && job.lon !== null && !isNaN(job.lat) && !isNaN(job.lon);

        if (!isRemote && hasCoordinates) {
            hasMappedJobs = true;
            // Dibujar marcador
            const pinIcon = job.modalidad === 'Híbrido' ? purpleIcon : orangeIcon;
            const marker = L.marker([job.lat, job.lon], { icon: pinIcon }).addTo(map);

            marker.bindPopup(getBasicPopupContent(job));

            // Guardar marcador en objeto global
            jobMarkers[job.id] = marker;
            bounds.extend([job.lat, job.lon]);

            // Listeners del marcador
            marker.on('mouseover', () => {
                marker.openPopup();
                hoverJob(job, marker);
            });

            marker.on('mouseout', () => {
                clearHover();
            });

            marker.on('click', () => {
                selectJob(job, marker, true);
            });

            // Añadir a barra lateral de geolocalizados
            const card = createJobCard(job, false);
            mappedJobsList.appendChild(card);
        } else {
            hasRemoteJobs = true;
            // Añadir a barra lateral de remotos
            const card = createJobCard(job, true);
            remoteJobsList.appendChild(card);
        }
    });

    if (!hasMappedJobs) {
        mappedJobsList.innerHTML = '<div class="text-center text-secondary py-3 fs-7">No hay empleos geolocalizables.</div>';
    }
    if (!hasRemoteJobs) {
        remoteJobsList.innerHTML = '<div class="text-center text-secondary py-3 fs-7">No hay ofertas en remoto.</div>';
    }

    // Centrar mapa si hay marcadores pintados
    if (hasMappedJobs) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        // Calcular distancias y mostrarlas en la barra lateral solo si es la carga inicial
        if (userLocation && isInitialLoad) {
            updateJobDistances();
        }
    }
}

// Crear elemento card de trabajo en barra lateral
function createJobCard(job, isRemote) {
    const card = document.createElement('div');
    card.className = `map-job-card animate-fade-in`;
    card.id = `job-card-${job.id}`;

    let badgeClass = 'badge-presencial';
    if (job.modalidad === 'Híbrido') badgeClass = 'badge-hibrido';
    if (job.modalidad === 'Remoto') badgeClass = 'badge-remoto';

    const formattedSalary = formatSalary(job.salario);

    // Si ya tiene distancia calculada en la caché, renderizarla síncronamente
    let distanceContentHtml = '';
    if (!isRemote && job.calculatedDistance !== undefined && job.calculatedDistance !== null) {
        const monthlyCost = calculateMonthlyFuelCost(job.calculatedDistance, job.modalidad);
        const iconClass = job.distanceType === 'straight' ? 'bi-signpost-split' : 'bi-car-front-fill';
        const prefix = job.distanceType === 'straight' ? '~' : '';
        distanceContentHtml = `
            <div class="d-flex flex-column align-items-end">
                <span><i class="bi ${iconClass} me-1"></i>${prefix}${job.calculatedDistance.toFixed(1)} km</span>
                <span class="fs-9 text-success fw-normal mt-0.5"><i class="bi bi-currency-euro me-0.5"></i>${prefix}${monthlyCost.toFixed(2)}/mes</span>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div style="max-width: 70%;">
                <h3 class="map-job-card-title mb-1 text-truncate">${job.puesto}</h3>
                <div class="map-job-card-company text-truncate mb-1">${job.empresa}</div>
                <div class="text-warning mb-1" style="font-size: 0.75rem;">
                    ${renderFlames(job.interes || 1)}
                </div>
            </div>
            <div class="d-flex flex-column align-items-end gap-1">
                <span class="badge ${badgeClass}" style="font-size: 0.65rem; text-transform: none;">${job.modalidad || 'Presencial'}</span>
                ${!isRemote ? `<span id="distance-${job.id}" class="fs-9 text-warning fw-semibold mt-1">${distanceContentHtml}</span>` : ''}
            </div>
        </div>
        <div class="d-flex justify-content-between map-job-card-details mt-2">
            <span class="text-truncate" style="max-width: 60%;"><i class="bi bi-geo-alt-fill me-1 text-danger"></i>${job.ubicacion || 'Remoto'}</span>
            <span class="text-gradient-cyan fw-bold">${formattedSalary}</span>
        </div>
    `;

    if (!isRemote) {
        card.addEventListener('mouseenter', () => {
            const marker = jobMarkers[job.id];
            if (marker) {
                marker.openPopup();
                hoverJob(job, marker);
            }
        });

        card.addEventListener('mouseleave', () => {
            clearHover();
        });

        card.addEventListener('click', () => {
            const marker = jobMarkers[job.id];
            if (marker) {
                selectJob(job, marker, true);
            }
        });
    }

    return card;
}

// Seleccionar empleo (click)
function selectJob(job, marker, shouldZoom = false) {
    clickedJobId = job.id;
    if (shouldZoom && map) {
        map.setView([job.lat, job.lon], 15);
    }
    marker.openPopup();
    calculateAndDrawRoute(job, marker, true);
    highlightSidebarCard(job.id, true);
}

// Hover sobre empleo
function hoverJob(job, marker) {
    if (clickedJobId === job.id) return;
    calculateAndDrawRoute(job, marker, false);
    highlightSidebarCard(job.id, false);
}

// Limpiar hover y restaurar si hay un empleo clicado
function clearHover() {
    if (clickedJobId) {
        const clickedJob = allOffers.find(j => j.id == clickedJobId);
        const clickedMarker = jobMarkers[clickedJobId];
        if (clickedJob && clickedMarker) {
            calculateAndDrawRoute(clickedJob, clickedMarker, false);
            highlightSidebarCard(clickedJobId, false);
        }
    } else {
        clearActiveRoute();
        unhighlightSidebarCards();
    }
}

// Limpiar la ruta y restaurar popup básico
function clearActiveRoute() {
    if (activeRouteLayer) {
        map.removeLayer(activeRouteLayer);
        activeRouteLayer = null;
    }
    // Si había una ruta activa de un empleo y no es el clicado permanente, restauramos su popup básico
    if (currentRouteJobId && currentRouteJobId !== clickedJobId) {
        const prevJob = allOffers.find(j => j.id == currentRouteJobId);
        const prevMarker = jobMarkers[currentRouteJobId];
        if (prevJob && prevMarker) {
            prevMarker.setPopupContent(getBasicPopupContent(prevJob));
        }
    }
    currentRouteJobId = null;
}

// Quitar resaltado de todas las tarjetas
function unhighlightSidebarCards() {
    if (currentActiveCard) {
        currentActiveCard.classList.remove('active');
        currentActiveCard = null;
    }
}

// Resaltar tarjeta activa en sidebar
function highlightSidebarCard(jobId, shouldScroll = true) {
    if (currentActiveCard) {
        currentActiveCard.classList.remove('active');
    }
    const newActiveCard = document.getElementById(`job-card-${jobId}`);
    if (newActiveCard) {
        newActiveCard.classList.add('active');
        currentActiveCard = newActiveCard;
        if (shouldScroll) {
            newActiveCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Calcular ruta OSRM y dibujar línea
async function calculateAndDrawRoute(job, marker, showError = false) {
    if (currentRouteJobId === job.id) return;

    // Si cambiamos de ruta activa, restauramos el popup del marcador previo
    if (currentRouteJobId && currentRouteJobId !== job.id && currentRouteJobId !== clickedJobId) {
        const prevJob = allOffers.find(j => j.id == currentRouteJobId);
        const prevMarker = jobMarkers[currentRouteJobId];
        if (prevJob && prevMarker) {
            prevMarker.setPopupContent(getBasicPopupContent(prevJob));
        }
    }

    currentRouteJobId = job.id;

    // Limpiar capa de ruta anterior
    if (activeRouteLayer) {
        map.removeLayer(activeRouteLayer);
        activeRouteLayer = null;
    }

    const avoidTolls = document.getElementById('switch-avoid-tolls')?.checked;
    const avoidHighways = document.getElementById('switch-avoid-highways')?.checked;
    let excludeParams = [];
    if (avoidTolls) excludeParams.push('toll');
    if (avoidHighways) excludeParams.push('motorway');

    const start = `${userLocation.lon},${userLocation.lat}`;
    const end = `${job.lon},${job.lat}`;
    let osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;
    if (excludeParams.length > 0) {
        osrmUrl += `&exclude=${excludeParams.join(',')}`;
    }

    try {
        const response = await fetch(osrmUrl);
        if (response.ok) {
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const distanceKm = (route.distance / 1000).toFixed(1);
                const durationMin = Math.round(route.duration / 60);

                const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

                // Trazar línea de brillo (glow effect)
                const glowLine = L.polyline(coordinates, {
                    color: '#9333ea',
                    weight: 8,
                    opacity: 0.3
                });

                // Trazar línea principal discontinua (dash)
                const mainLine = L.polyline(coordinates, {
                    color: '#5a62f6',
                    weight: 4,
                    opacity: 0.9,
                    dashArray: '2, 8'
                });

                // Agrupar rutas en una única capa
                activeRouteLayer = L.featureGroup([glowLine, mainLine]).addTo(map);

                // Calcular coste de combustible mensual
                const monthlyFuelCost = calculateMonthlyFuelCost(parseFloat(distanceKm), job.modalidad);

                // Construir el popup combinado (Información del empleo + Ruta y Consumo)
                const formattedSalary = formatSalary(job.salario);
                const routeHtml = `
                    <div class="border-top border-secondary pt-2 mt-2" style="border-color: rgba(255,255,255,0.08) !important;">
                        <div class="fw-bold text-light fs-8 mb-1"><i class="bi bi-car-front-fill me-1 text-primary"></i>En automóvil:</div>
                        <div class="d-flex justify-content-between fs-9 text-secondary">
                            <span>Distancia: <strong>${distanceKm} km</strong></span>
                            <span>Tiempo: <strong>${durationMin} min</strong></span>
                        </div>
                        <div class="text-success fw-semibold mt-1 fs-9"><i class="bi bi-cash me-1"></i>Est: ${monthlyFuelCost.toFixed(2)} €/mes</div>
                    </div>
                `;
                const combinedPopupContent = `
                    <div style="min-width: 190px;">
                        <h6 class="fw-bold mb-1 text-light fs-7">${job.puesto}</h6>
                        <div class="text-secondary fs-8 mb-1">${job.empresa}</div>
                        <div class="text-warning mb-2" style="font-size: 0.75rem;">
                            ${renderFlames(job.interes || 1)}
                        </div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="badge badge-status ${job.modalidad === 'Híbrido' ? 'badge-hibrido' : 'badge-presencial'}" style="font-size: 0.65rem; text-transform: none;">${job.modalidad}</span>
                            <span class="text-gradient-cyan fw-bold fs-8">${formattedSalary}</span>
                        </div>
                        <div class="text-secondary fs-9 mt-1"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${job.ubicacion || 'Sin dirección'}</div>
                        ${routeHtml}
                    </div>
                `;

                // Actualizar el contenido del popup en vez de abrir un tooltip secundario
                marker.setPopupContent(combinedPopupContent);
            } else {
                if (showError) {
                    showToast('No se encontró una ruta de conducción válida hacia ' + job.empresa, 'error');
                }
            }
        } else {
            if (showError) {
                showToast('Error al conectar con el servidor de rutas.', 'error');
            }
        }
    } catch (err) {
        console.error('Error OSRM routing:', err);
        if (showError) {
            showToast('No se pudo calcular la ruta de conducción hacia ' + job.empresa, 'error');
        }
    }
}

// Recalcular ruta activa al cambiar switches
function recalculateActiveRoute() {
    if (clickedJobId) {
        const clickedJob = allOffers.find(j => j.id == clickedJobId);
        const clickedMarker = jobMarkers[clickedJobId];
        if (clickedJob && clickedMarker) {
            currentRouteJobId = null;
            calculateAndDrawRoute(clickedJob, clickedMarker, false);
        }
    }
}

// Calcular distancia desde usuario a cada oferta geolocalizada y mostrarla
async function updateJobDistances() {
    const geolocalizedJobs = allOffers.filter(job => job.modalidad !== 'Remoto' && job.lat !== null && job.lon !== null && !isNaN(job.lat) && !isNaN(job.lon));
    if (geolocalizedJobs.length === 0 || !userLocation) return;

    // Obtener preferencias
    const avoidTolls = document.getElementById('switch-avoid-tolls')?.checked;
    const avoidHighways = document.getElementById('switch-avoid-highways')?.checked;
    let excludeParams = [];
    if (avoidTolls) excludeParams.push('toll');
    if (avoidHighways) excludeParams.push('motorway');

    // Construir coordenadas: primera coordenada es el origen (usuario)
    const coords = [`${userLocation.lon},${userLocation.lat}`];
    geolocalizedJobs.forEach(job => {
        coords.push(`${job.lon},${job.lat}`);
    });

    const coordsString = coords.join(';');
    let tableUrl = `https://router.project-osrm.org/table/v1/driving/${coordsString}?sources=0&annotations=distance`;
    if (excludeParams.length > 0) {
        tableUrl += `&exclude=${excludeParams.join(',')}`;
    }

    try {
        const response = await fetch(tableUrl);
        if (response.ok) {
            const data = await response.json();
            if (data.distances && data.distances[0]) {
                const distancesArray = data.distances[0]; // distancia del origen i al destino j
                geolocalizedJobs.forEach((job, index) => {
                    const distanceMeters = distancesArray[index + 1];
                    const distSpan = document.getElementById(`distance-${job.id}`);
                    if (distanceMeters !== null && distanceMeters !== undefined) {
                        const distanceKm = parseFloat((distanceMeters / 1000).toFixed(1));
                        job.calculatedDistance = distanceKm;
                        job.distanceType = 'route';
                        if (distSpan) {
                            const monthlyCost = calculateMonthlyFuelCost(distanceKm, job.modalidad);
                            distSpan.innerHTML = `
                                <div class="d-flex flex-column align-items-end">
                                    <span><i class="bi bi-car-front-fill me-1"></i>${distanceKm} km</span>
                                    <span class="fs-9 text-success fw-normal mt-0.5"><i class="bi bi-currency-euro me-0.5"></i>${monthlyCost.toFixed(2)}/mes</span>
                                </div>
                            `;
                        }
                    } else {
                        // Fallback Haversine
                        const straightDist = calculateHaversineDistance(userLocation, { lat: job.lat, lon: job.lon });
                        job.calculatedDistance = straightDist;
                        job.distanceType = 'straight';
                        if (distSpan) {
                            const monthlyCost = calculateMonthlyFuelCost(straightDist, job.modalidad);
                            distSpan.innerHTML = `
                                <div class="d-flex flex-column align-items-end">
                                    <span><i class="bi bi-signpost-split me-1"></i>~${straightDist.toFixed(1)} km</span>
                                    <span class="fs-9 text-success fw-normal mt-0.5"><i class="bi bi-currency-euro me-0.5"></i>~${monthlyCost.toFixed(2)}/mes</span>
                                </div>
                            `;
                        }
                    }
                });
                return;
            }
        }
        throw new Error('Error en API OSRM Table');
    } catch (err) {
        console.warn('Fallo al obtener distancias de OSRM. Usando fallback de Haversine (Línea recta):', err);
        geolocalizedJobs.forEach(job => {
            const straightDist = calculateHaversineDistance(userLocation, { lat: job.lat, lon: job.lon });
            job.calculatedDistance = straightDist;
            job.distanceType = 'straight';
            const distSpan = document.getElementById(`distance-${job.id}`);
            if (distSpan) {
                const monthlyCost = calculateMonthlyFuelCost(straightDist, job.modalidad);
                distSpan.innerHTML = `
                    <div class="d-flex flex-column align-items-end">
                        <span><i class="bi bi-signpost-split me-1"></i>~${straightDist.toFixed(1)} km</span>
                        <span class="fs-9 text-success fw-normal mt-0.5"><i class="bi bi-currency-euro me-0.5"></i>~${monthlyCost.toFixed(2)}/mes</span>
                    </div>
                `;
            }
        });
    }
}

// Fórmula de Haversine para distancia en línea recta
function calculateHaversineDistance(coords1, coords2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
    const dLon = (coords2.lon - coords1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calcular coste de combustible estimado mensual
function calculateMonthlyFuelCost(distanceKm, modality) {
    if (modality === 'Remoto' || !distanceKm || isNaN(distanceKm)) return 0;
    
    const price = parseFloat(document.getElementById('input-fuel-price')?.value) || 1.65;
    const consumption = parseFloat(document.getElementById('input-fuel-consumption')?.value) || 6.5;
    
    // Días mensuales estimativos: Presencial = 20 días/mes, Híbrido = 12 días/mes (promedio de 3 días/semana)
    const officeDays = modality === 'Híbrido' ? 12 : 20;
    
    // Distancia ida y vuelta por mes
    const monthlyDistance = distanceKm * 2 * officeDays;
    
    // Litros consumidos
    const monthlyLiters = (monthlyDistance * consumption) / 100;
    
    // Coste total
    return (monthlyLiters * price);
}

// Obtener estructura de popup básico de la oferta
function getBasicPopupContent(job) {
    const formattedSalary = formatSalary(job.salario);
    return `
        <div style="min-width: 190px;">
            <h6 class="fw-bold mb-1 text-light fs-7">${job.puesto}</h6>
            <div class="text-secondary fs-8 mb-1">${job.empresa}</div>
            <div class="text-warning mb-2" style="font-size: 0.75rem;">
                ${renderFlames(job.interes || 1)}
            </div>
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge badge-status ${job.modalidad === 'Híbrido' ? 'badge-hibrido' : 'badge-presencial'}" style="font-size: 0.65rem; text-transform: none;">${job.modalidad}</span>
                <span class="text-gradient-cyan fw-bold fs-8">${formattedSalary}</span>
            </div>
            <div class="text-secondary fs-9 mt-1"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${job.ubicacion || 'Sin dirección'}</div>
        </div>
    `;
}

// Aplicar filtros de la barra lateral
function applyFilters() {
    const searchQuery = document.getElementById('input-filter-search')?.value.trim().toLowerCase();
    const dateFromVal = document.getElementById('input-filter-date-from')?.value; // YYYY-MM-DD
    const dateToVal = document.getElementById('input-filter-date-to')?.value; // YYYY-MM-DD
    const statusVal = document.getElementById('select-filter-status')?.value;
    const modalityVal = document.getElementById('select-filter-modality')?.value;
    const maxDistanceVal = parseFloat(document.getElementById('range-filter-distance')?.value) || 101;

    const filtered = allOffers.filter(job => {
        // 1. Filtro de Texto
        if (searchQuery) {
            const puesto = (job.puesto || '').toLowerCase();
            const empresa = (job.empresa || '').toLowerCase();
            const ubicacion = (job.ubicacion || '').toLowerCase();
            if (!puesto.includes(searchQuery) && !empresa.includes(searchQuery) && !ubicacion.includes(searchQuery)) {
                return false;
            }
        }

        // 2. Rango de Fechas
        if (dateFromVal || dateToVal) {
            if (!job.fecha_postulacion) {
                return false;
            }
            if (dateFromVal && job.fecha_postulacion < dateFromVal) {
                return false;
            }
            if (dateToVal && job.fecha_postulacion > dateToVal) {
                return false;
            }
        }

        // 3. Estado
        if (statusVal && statusVal !== 'Todos') {
            if (job.estado !== statusVal) return false;
        }

        // 4. Modalidad
        if (modalityVal && modalityVal !== 'Todos') {
            if (job.modalidad !== modalityVal) return false;
        }

        // 5. Distancia Máxima
        if (maxDistanceVal < 101) {
            // Si hay límite de distancia, los puestos Remotos se excluyen porque no tienen desplazamiento físico
            if (job.modalidad === 'Remoto') {
                return false;
            }
            if (job.calculatedDistance === undefined || job.calculatedDistance === null || job.calculatedDistance > maxDistanceVal) {
                return false;
            }
        }

        return true;
    });

    renderJobs(filtered, false);
}

// Pintar fueguitos en HTML (Fase 11)
function renderFlames(rating) {
    let html = '';
    const activeRating = parseInt(rating) || 1;
    for (let i = 1; i <= 5; i++) {
        if (i <= activeRating) {
            html += '<i class="bi bi-fire flame-active me-0.5" style="display: inline-block;"></i>';
        } else {
            html += '<i class="bi bi-fire text-muted opacity-40 me-0.5"></i>';
        }
    }
    return html;
}

// Formatear salario flexible (Fase 11)
function formatSalary(salary) {
    if (!salary) return 'No esp.';
    const clean = String(salary).trim();
    if (clean === '') return 'No esp.';
    
    // Si contiene caracteres que indiquen rango o formato de texto, se muestra tal cual
    const isNumericOnly = /^\d+([\.,]\d+)?$/.test(clean.replace(/\s/g, ''));
    if (isNumericOnly) {
        const num = parseFloat(clean.replace(/\./g, '').replace(/,/g, '.'));
        if (!isNaN(num)) {
            return `${num.toLocaleString('es-ES')} €`;
        }
    }
    
    if (clean.includes('€')) {
        return clean;
    }
    return `${clean} €`;
}
