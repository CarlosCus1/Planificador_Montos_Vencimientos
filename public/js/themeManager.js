/**
 * Gestor del tema visual de la aplicación (claro/oscuro)
 */
export class ThemeManager {
    static applyInitialTheme() {
        const storedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(storedTheme);
    }

    static toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    static setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }
}