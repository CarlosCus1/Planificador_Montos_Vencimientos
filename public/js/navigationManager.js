/**
 * Gestiona la navegación entre las diferentes páginas (pasos) de la aplicación.
 */
export class NavigationManager {
    /**
     * @param {NodeListOf<HTMLElement>} pages - Una lista de los elementos de página.
     * @param {NodeListOf<HTMLElement>} progressSteps - Una lista de los elementos del indicador de progreso.
     */
    constructor(pages, progressSteps) {
        this.pages = pages;
        this.progressSteps = progressSteps;
        this.currentPageIndex = 0;
        this.bannerTextElement = document.getElementById('banner-status-text');
        this.bannerTexts = [
            'Paso 1: Selección de Fechas',
            'Paso 2: Datos del Cliente y Monto',
            'Paso 3: Resultados y Reportes'
        ];

        this.progressSteps.forEach(step => {
            step.addEventListener('click', () => this.handleStepClick(step));
        });

        // Establecer el estado inicial de la UI al cargar
        this.goToPage(this.currentPageIndex);
    }

    handleStepClick(step) {
        const stepIndex = parseInt(step.dataset.step, 10);
        if (!isNaN(stepIndex)) {
            this.goToPage(stepIndex);
        }
    }

    /**
     * Navega a una página específica por su índice.
     * @param {number} index - El índice de la página a la que se quiere navegar.
     */
    goToPage(index) {
        if (index < 0 || index >= this.pages.length) return;

        this.pages.forEach((page, i) => {
            page.classList.toggle('active', i === index);
            page.setAttribute('aria-current', i === index ? 'page' : null);
        });
        this.currentPageIndex = index;
        this._updateProgressIndicator();

        // Actualizar el texto del banner
        if (this.bannerTextElement && this.bannerTexts[index]) {
            this.bannerTextElement.textContent = this.bannerTexts[index];
        }

        // Enfocar el primer elemento interactivo de la nueva página para mejorar la accesibilidad.
        setTimeout(() => {
            const focusable = this.pages[index].querySelector('button, input, [tabindex]:not([tabindex="-1"])');
            focusable?.focus();
        }, 100);
    }

    _updateProgressIndicator() {
        this.progressSteps.forEach((step, i) => {
            step.classList.remove('active', 'completed');
            if (i === this.currentPageIndex) step.classList.add('active');
            else if (i < this.currentPageIndex) step.classList.add('completed');
        });
    }
}