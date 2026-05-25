/* ==========================================================================
   JS Perfil & Configuración de Cuenta - JobTracker
   ========================================================================== */

const API_BASE_PROFILE = window.API_BASE_URL || 'servidor';
const MOCK_USERS_KEY = 'mock_users';

let isMockProfile = false;
let currentEmail = '';

document.addEventListener('DOMContentLoaded', () => {
    const session = Auth.isAuthenticated();
    if (session && session.user) {
        document.getElementById('navbar-username').textContent = session.user.nombre;
    }

    // Botón de salir
    document.getElementById('btn-logout').addEventListener('click', () => {
        Auth.logout();
    });

    // Cargar perfil
    loadProfile();

    // Event listener para actualizar perfil
    document.getElementById('form-profile').addEventListener('submit', handleProfileUpdate);

    // Event listener para habilitar botón de borrado de cuenta en modal
    const inputDeleteConfirm = document.getElementById('input-delete-confirm');
    const btnDeleteConfirm = document.getElementById('btn-delete-account-confirm');

    inputDeleteConfirm.addEventListener('input', () => {
        const text = inputDeleteConfirm.value.trim();
        if (text === 'ELIMINAR') {
            btnDeleteConfirm.removeAttribute('disabled');
        } else {
            btnDeleteConfirm.setAttribute('disabled', 'true');
        }
    });

    // Event listener para borrar cuenta definitiva
    document.getElementById('form-delete-account').addEventListener('submit', handleDeleteAccount);
});

// Cargar perfil del servidor o fallback local JWT
async function loadProfile() {
    const session = Auth.isAuthenticated();
    const token = session ? session.token : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_PROFILE}/user_profile.php`, { headers });
        if (response.ok) {
            const data = await response.json();
            document.getElementById('input-profile-username').value = data.username || '';
            document.getElementById('input-profile-email').value = data.email || '';
            currentEmail = data.email || '';
            isMockProfile = false;
        } else {
            throw new Error('No se pudo conectar a la base de datos externa');
        }
    } catch (error) {
        console.warn('Usando datos de sesión local mock para el perfil.');
        isMockProfile = true;
        
        if (session && session.user) {
            document.getElementById('input-profile-username').value = session.user.nombre || '';
            document.getElementById('input-profile-email').value = session.user.email || '';
            currentEmail = session.user.email || '';
        }
    }
}

// Guardar cambios del perfil (Username)
async function handleProfileUpdate(e) {
    e.preventDefault();

    const usernameInput = document.getElementById('input-profile-username');
    const username = usernameInput.value.trim();
    if (!username) return;

    const btn = document.getElementById('btn-save-profile');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Guardando...`;

    if (isMockProfile) {
        // Modo local mock
        const session = Auth.isAuthenticated();
        if (session && session.user) {
            session.user.nombre = username;
            localStorage.setItem('job_tracker_session', JSON.stringify(session));

            // Actualizar en mock_users para persistencia
            const users = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
            const userIndex = users.findIndex(u => u.email === currentEmail);
            if (userIndex !== -1) {
                users[userIndex].nombre = username;
                localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
            }

            // Actualizar navbar
            document.getElementById('navbar-username').textContent = username;
            showToast('Nombre de usuario actualizado localmente.', 'success');
        }
        btn.disabled = false;
        btn.innerHTML = originalText;
    } else {
        // Enviar PUT al servidor externo
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            const response = await fetch(`${API_BASE_PROFILE}/user_profile.php`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify({ username })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Actualizar token en sesión local
                session.user.nombre = data.username;
                localStorage.setItem('job_tracker_session', JSON.stringify(session));

                // Actualizar navbar
                document.getElementById('navbar-username').textContent = data.username;
                showToast('Perfil actualizado en la base de datos.', 'success');
            } else {
                const err = await response.json();
                showToast(err.error || 'Error al actualizar perfil.', 'error');
            }
        } catch (err) {
            console.error('Error al actualizar perfil:', err);
            showToast('Error al conectar con el servidor externo.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// Eliminar cuenta permanentemente
async function handleDeleteAccount(e) {
    e.preventDefault();

    const inputConfirm = document.getElementById('input-delete-confirm').value.trim();
    if (inputConfirm !== 'ELIMINAR') return;

    const btn = document.getElementById('btn-delete-account-confirm');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Eliminando...`;

    if (isMockProfile) {
        // Eliminar del localStorage local
        const users = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
        const updatedUsers = users.filter(u => u.email !== currentEmail);
        localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(updatedUsers));

        // Limpiar todas las claves mock asociadas para no dejar basura huérfana
        // Opcional: borrar postulaciones, eventos y portales mock del usuario
        // Como el localStorage es compartido, podemos limpiar las claves de mock generales
        localStorage.removeItem('job_tracker_offers');
        localStorage.removeItem('job_tracker_events');
        localStorage.removeItem('job_tracker_questions');
        localStorage.removeItem('job_tracker_search_portals');
        localStorage.removeItem('job_tracker_search_categories');
        localStorage.removeItem('job_tracker_user_home');

        // Cerrar sesión
        localStorage.removeItem('job_tracker_session');
        showToast('Cuenta eliminada con éxito del simulador.', 'info');

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    } else {
        // Enviar petición DELETE a la API externa
        try {
            const session = Auth.isAuthenticated();
            const token = session ? session.token : '';
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            const response = await fetch(`${API_BASE_PROFILE}/user_profile.php`, {
                method: 'DELETE',
                headers: headers
            });

            if (response.ok) {
                // Cerrar modal
                const modalEl = document.getElementById('modal-delete-account');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();

                showToast('Cuenta eliminada permanentemente. Redirigiendo...', 'info');

                // Limpiar la sesión
                localStorage.removeItem('job_tracker_session');
                // Limpiar también localStorage de configuración local por si acaso
                localStorage.removeItem('job_tracker_user_home');

                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } else {
                const err = await response.json();
                showToast(err.error || 'Error al eliminar la cuenta.', 'error');
                btn.disabled = false;
                btn.textContent = 'Borrar Cuenta';
            }
        } catch (err) {
            console.error('Error al borrar cuenta:', err);
            showToast('Fallo al conectar con el servidor externo.', 'error');
            btn.disabled = false;
            btn.textContent = 'Borrar Cuenta';
        }
    }
}
