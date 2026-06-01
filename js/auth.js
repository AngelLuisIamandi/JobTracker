/* ==========================================================================
   JS Autenticación - Registro de Ofertas de Empleo
   ========================================================================== */

const API_BASE_URL = window.location.origin + '/api';
window.API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

// Helper para mostrar notificaciones Toasts
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container-custom';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    
    let icon = '💡';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <span class="me-2">${icon}</span>
            <span>${message}</span>
        </div>
        <button type="button" class="btn-close ms-3" style="font-size: 0.75rem;" onclick="this.parentElement.remove()"></button>
    `;

    container.appendChild(toast);
    
    // Auto-eliminar después de 4 segundos
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Objeto Auth con la lógica de autenticación
const Auth = {
    // Comprobar si hay una sesión activa
    isAuthenticated: function() {
        const session = localStorage.getItem('job_tracker_session');
        if (!session) return false;
        try {
            const sessionData = JSON.parse(session);
            // Comprobación simple de expiración (por ejemplo, 7 días)
            const now = new Date().getTime();
            if (sessionData.expiresAt && now > sessionData.expiresAt) {
                this.logout();
                return false;
            }
            return sessionData;
        } catch (e) {
            return false;
        }
    },

    // Iniciar Sesión (Intenta PHP API primero, luego Mock Fallback)
    login: async function(email, password) {
        // Bypass inmediato si es el usuario demo para asegurar el funcionamiento del modo demostración
        if (email === 'demo@demo.com' && password === 'JobTrackerDemoPass2026!') {
            return this.mockLogin(email, password);
        }
        try {
            const response = await fetch(`${API_BASE_URL}/login.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();
                // Adaptar el usuario retornado por el backend
                const adaptedUser = {
                    nombre: data.user.username || data.user.nombre || 'Usuario',
                    email: data.user.email
                };
                this.saveSession(data.token, adaptedUser, data.expires_at);
                return { success: true, message: '¡Inicio de sesión exitoso!' };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return { success: false, message: errorData.error || 'Credenciales incorrectas.' };
            }
        } catch (error) {
            console.warn('Conexión al servidor fallida. Usando base de datos local simulada (mock).', error);
            return this.mockLogin(email, password);
        }
    },

    // Registrar Usuario (Intenta PHP API primero, luego Mock Fallback)
    register: async function(nombre, email, password) {
        try {
            const response = await fetch(`${API_BASE_URL}/register.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: nombre, email, password })
            });

            if (response.ok) {
                return { success: true, message: '¡Registro completado con éxito!' };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return { success: false, message: errorData.error || 'Error al registrar el usuario.' };
            }
        } catch (error) {
            console.warn('Conexión al servidor fallida. Usando base de datos local simulada (mock).', error);
            return this.mockRegister(nombre, email, password);
        }
    },

    // Cerrar sesión
    logout: function() {
        localStorage.removeItem('job_tracker_session');
        showToast('Sesión cerrada correctamente.', 'info');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    },

    // Guardar sesión en LocalStorage
    saveSession: function(token, user, expiresAtStr = null) {
        const expiresAt = expiresAtStr 
            ? new Date(expiresAtStr.replace(' ', 'T')).getTime() 
            : new Date().getTime() + (7 * 24 * 60 * 60 * 1000); // 7 días
        const sessionData = {
            token,
            user,
            expiresAt
        };
        localStorage.setItem('job_tracker_session', JSON.stringify(sessionData));
    },

    // --- MÉTODOS MOCK (Para pruebas sin servidor backend) ---
    mockLogin: function(email, password) {
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        
        // Si no hay usuarios creados, creamos uno por defecto para facilitar pruebas
        if (users.length === 0) {
            const defaultUser = { nombre: 'Usuario Demo', email: 'demo@demo.com', password: 'JobTrackerDemoPass2026!' };
            users.push(defaultUser);
            localStorage.setItem('mock_users', JSON.stringify(users));
        }

        const user = users.find(u => u.email === email && u.password === password);
        if (user) {
            const mockToken = 'mock_jwt_token_' + Math.random().toString(36).substr(2);
            this.saveSession(mockToken, { nombre: user.nombre, email: user.email });
            return { success: true, message: 'Sesión iniciada con usuario simulado.' };
        } else {
            return { success: false, message: 'Correo o contraseña incorrectos en base de datos local (Prueba con demo@demo.com / JobTrackerDemoPass2026!).' };
        }
    },

    mockRegister: function(nombre, email, password) {
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        
        const exists = users.some(u => u.email === email);
        if (exists) {
            return { success: false, message: 'El correo electrónico ya está registrado en la base de datos local.' };
        }

        users.push({ nombre, email, password });
        localStorage.setItem('mock_users', JSON.stringify(users));
        return { success: true, message: 'Usuario simulado registrado. ¡Ya puedes iniciar sesión!' };
    },

    // Comprobar y redirigir según el estado de autenticación de la página
    checkPageAuth: function(protectedPage = true) {
        const session = this.isAuthenticated();
        if (protectedPage) {
            if (!session) {
                // Redirigir a login si es una página protegida y no está autenticado
                window.location.href = 'login.html';
            } else {
                // Si está autenticado, rellenar el nombre en el navbar/pantalla si existe
                document.addEventListener('DOMContentLoaded', () => {
                    const userNameEl = document.getElementById('navbar-username');
                    if (userNameEl) {
                        userNameEl.textContent = session.user.nombre;
                    }
                });
            }
        } else {
            // Páginas de auth (login, register): redirigir a index si ya tiene sesión
            if (session) {
                window.location.href = 'index.html';
            }
        }
    }
};
