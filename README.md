# Sistema de Evaluaciones

Aplicación web con Node.js para crear y gestionar evaluaciones en línea.

## Características

- 🔐 Autenticación con email y contraseña
- 📋 Panel de administración para crear exámenes
- ❓ Preguntas de opción múltiple y desarrollo (respuesta libre)
- 📧 Lista de correos autorizados para registro
- 👥 Gestión de usuarios (habilitar/deshabilitar, promover a admin)
- 📊 Resultados con el correo de cada participante
- 📋 Duplicar exámenes y editar preguntas
- ✅ Prevención de doble envío

## Instalación

```bash
npm install
```

## Configuración

Copia `.env.example` a `.env` y ajusta los valores:

```env
PORT=3000
SESSION_SECRET=tu-secreto-seguro
```

## Uso

```bash
node server.js
```

Abre http://localhost:3000

El **primer usuario** en registrarse se convierte automáticamente en administrador.

## Stack

- Node.js + Express
- SQLite (better-sqlite3)
- EJS (vistas)
- bcryptjs (contraseñas)
- express-session (sesiones)
