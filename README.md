# Planificador de Vencimientos y Montos

**Versión 2.0**

Aplicación web completa para la planificación y distribución de montos en fechas de vencimiento, con gestión dinámica de feriados peruanos y generación de reportes profesionales.

## Características Principales

*   **Calendario Interactivo:** Selección de fechas con deshabilitación automática de domingos y feriados.
*   **Distribución de Montos:** Algoritmo robusto para distribuir un monto total de forma equitativa entre las fechas seleccionadas.
*   **Ajuste Manual:** Permite la edición manual de los montos distribuidos, con recálculo de totales en tiempo real.
*   **Consulta de RUC:** Integración con una API externa para validar y autocompletar datos de empresas peruanas, optimizada con un sistema de caché en Firestore.
*   **Generación de Reportes:**
    *   **Excel (.xlsx):** Reporte profesional con dashboard, resumen mensual, detalle por fecha y un gráfico de pastel.
    *   **JSON (.json):** Archivo de respaldo que permite recrear el reporte Excel exacto en cualquier momento.
*   **Seguridad:** Implementación de límite de tasa (rate limiting) en el backend para prevenir abusos en la consulta de APIs.
*   **Interfaz Moderna:** Diseño responsive (adaptable a móviles) con tema claro y oscuro.

## Arquitectura

El proyecto sigue una arquitectura de aplicación web moderna, utilizando la plataforma Firebase:

*   **Frontend:**
    *   Desarrollado con **HTML5, CSS3 y JavaScript modular (ESM)**.
    *   Alojado en **Firebase Hosting**.
    *   Utiliza **FullCalendar.js** para el calendario y **Chart.js** para la visualización de gráficos.
*   **Backend (API REST):**
    *   Implementado como una única función monolítica con **Python y Flask**.
    *   Alojado en **Firebase Cloud Functions (2nd Gen)**.
    *   Interactúa con **Firestore** para la gestión de feriados y el caché de consultas RUC.
    *   Se comunica con una API externa para la consulta de RUC (apis.net.pe).
*   **Base de Datos:**
    *   **Firestore:** Utilizado para almacenar los feriados (gestionados dinámicamente) y para el caché de las consultas RUC.

## Configuración del Entorno de Desarrollo

### Requisitos Previos

*   Node.js y npm (para Firebase CLI)
*   Python 3.10 o superior
*   Firebase CLI (`npm install -g firebase-tools` o la versión que prefieras)
*   Acceso a un proyecto de Firebase con Firestore, Hosting y Functions habilitados.

### Pasos de Configuración

1.  **Clonar el Repositorio:**
    ```bash
    git clone <URL_DEL_REPOSITORIO>
    cd planificador-vencimientos-montos
    ```

2.  **Configuración de Firebase:**
    *   Inicia sesión en Firebase: `firebase login`
    *   Asocia el proyecto local con tu proyecto de Firebase: `firebase use --add` (selecciona tu `project-id`)

3.  **Configuración del Backend (Firebase Functions):**
    *   Navega a la carpeta de funciones: `cd functions`
    *   Crea un entorno virtual (si no existe): `python -m venv venv`
    *   Activa el entorno virtual:
        *   Windows (CMD): `.\venv\Scripts\activate`
        *   macOS/Linux: `source venv/bin/activate`
    *   Instala las dependencias: `pip install -r requirements.txt`
    *   **Configurar SUNAT API Token:**
        Este token es necesario para la consulta de RUC. Debes obtenerlo de apis.net.pe.
        ```bash
        firebase functions:config:set sunat.api_token="TU_SUNAT_API_TOKEN_AQUI"
        ```
        (Reemplaza `TU_SUNAT_API_TOKEN_AQUI` con tu token real).
    *   Vuelve al directorio raíz del proyecto: `cd ..`

## Ejecución Local

1.  **Iniciar Emuladores de Firebase:**
    Desde la raíz del proyecto, inicia los emuladores para Hosting, Functions y Firestore.
    ```bash
    firebase emulators:start --only hosting,functions,firestore
    ```
    Esto iniciará:
    *   **Frontend:** `http://localhost:5000`
    *   **Backend (Functions):** `http://localhost:5001`
    *   **Base de Datos (Firestore):** `http://localhost:8080`
    *   **UI de Emuladores:** `http://localhost:4000` (muy útil para ver los datos y logs)

## Despliegue a Producción

1.  **Asegurar Configuración de Producción:**
    Antes de desplegar, asegúrate de haber configurado las variables de entorno necesarias en Firebase, como el token de la API de SUNAT.
    ```bash
    firebase functions:config:set sunat.api_token="TU_SUNAT_API_TOKEN_AQUI"
    ```

2.  **Desplegar Todo el Proyecto:**
    Desde la raíz del proyecto:
    ```bash
    firebase deploy
    ```
    Este comando desplegará tanto el **frontend (Hosting)** como el **backend (Functions)**. Firebase leerá el archivo `firebase.json` para saber qué desplegar y cómo configurarlo.

    Una vez finalizado, podrás acceder a tu aplicación desde la URL de Hosting que te proporcionará la Firebase CLI.

## Estructura del Proyecto

```
.
├── public/                 # Contenido estático del frontend (HTML, CSS, JS)
│   ├── css/
│   ├── images/
│   ├── js/
│   │   ├── api.js          # Módulo de comunicación con el backend
│   │   ├── calendario.js   # Lógica del calendario
│   │   ├── rucManager.js   # Gestión de búsqueda de RUC
│   │   ├── main.js         # Orquestador principal de la aplicación
│   │   └── ... (otros módulos JS)
│   └── index.html
├── functions/              # Código del backend (Firebase Cloud Functions)
│   ├── main.py             # API Flask (antes index.py)
│   ├── requirements.txt    # Dependencias de Python para el backend
│   └── .env                # Variables de entorno para desarrollo local
├── admin_tools/            # Herramientas de administración
│   └── holiday_manager_app/
│       ├── holiday_manager.py  # Aplicación Tkinter para gestión de feriados
│       ├── requirements.txt    # Dependencias de Python para la herramienta
│       ├── .env                # Variables de entorno para la herramienta
│       └── holidays.json       # Archivo JSON con feriados fijos
├── firebase.json           # Configuración de Firebase para el proyecto
├── .firebaserc             # Configuración de proyectos Firebase
├── .gitignore              # Archivos y directorios a ignorar por Git
└── README.md               # Este archivo
```

## Limpieza del Proyecto

Durante el desarrollo, pueden generarse archivos temporales o de depuración. Se recomienda mantener el proyecto limpio.

*   **Archivos de Log:** `firebase-debug.log`, `pglite-debug.log` pueden eliminarse de forma segura.
*   **Archivos Malformados:** Si encuentras archivos con nombres extraños (ej. `api('csrf-token'`), elimínalos manualmente. En Windows, esto podría requerir PowerShell:
    ```powershell
    Remove-Item -LiteralPath 'C:\ruta\a\tu\proyecto\nombre_del_archivo_problematico' -Force
    ```